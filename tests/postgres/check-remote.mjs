import pg from 'pg';
import {readFileSync} from 'node:fs';
const raw=process.env.DATABASE_URL;
if(!raw)throw new Error('DATABASE_URL is missing');
const url=new URL(raw);
if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('PostgreSQL connection required');
if(!url.hostname.endsWith('.supabase.co')&&!url.hostname.endsWith('.supabase.com'))throw new Error('Expected a Supabase endpoint');
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
const ca=process.env.DATABASE_CA_PATH?readFileSync(process.env.DATABASE_CA_PATH,'utf8'):undefined;
const client=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true,servername:url.hostname,...(ca?{ca}:{})},connectionTimeoutMillis:15000,query_timeout:15000});
try{
 await client.connect();
 await client.query('BEGIN READ ONLY');
 const result=await client.query("SELECT current_setting('server_version') AS version, current_setting('transaction_read_only') AS read_only, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='work_orders') AS existing_public_work_orders");
 const schema=await client.query(`SELECT c.relname AS name,c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='near_agent_work' AND c.relkind='r' ORDER BY c.relname`);
 const guards=await client.query(`SELECT count(*)::int AS count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='near_agent_work' AND NOT t.tgisinternal AND t.tgenabled='O'`);
 const access=await client.query(`SELECT r.rolname,has_schema_privilege(r.oid,n.oid,'USAGE') AS schema_usage FROM pg_roles r CROSS JOIN pg_namespace n WHERE r.rolname IN ('anon','authenticated') AND n.nspname='near_agent_work'`);
 const expected=['command_results','deliverables','execution_events','jobs','subtasks','task_dependencies','verification_policies','verification_reports','work_orders'];
 if(schema.rows.some(r=>r.name==='workflow_runs'))expected.push('workflow_runs');
 if(schema.rows.some(r=>r.name==='evidence_objects'))expected.push('evidence_objects');expected.sort();
 const schemaValid=JSON.stringify(schema.rows.map(r=>r.name))===JSON.stringify(expected)&&schema.rows.every(r=>r.rls)&&access.rows.every(r=>!r.schema_usage);
 await client.query('ROLLBACK');
 console.log(JSON.stringify({schemaValid,tables:schema.rows,enabledGuardTriggers:guards.rows[0].count,clientRoleAccess:access.rows},null,2));
 if(!schemaValid)process.exitCode=1;
 console.log(JSON.stringify({connected:true,tlsCertificateVerified:true,readOnly:result.rows[0].read_only==='on',serverVersion:result.rows[0].version,existingPublicWorkOrders:result.rows[0].existing_public_work_orders,migrationsApplied:0},null,2));
}catch(error){
 console.error(JSON.stringify({connected:false,code:typeof error.code==='string'?error.code:'CONNECTION_FAILED',credentialsPrinted:false,migrationsApplied:0}));process.exitCode=1;
}finally{await client.end().catch(()=>{});}
