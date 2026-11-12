import {readFile} from 'node:fs/promises';
import {createDatabasePool} from '../packages/database/src/connection.ts';
import {invariant} from '../packages/shared/src/domain.ts';
invariant(process.argv.includes('--apply'),'Explicit --apply required for the additive runtime migration');
const pool=createDatabasePool(),c=await pool.connect();
try{
 await c.query('BEGIN');await c.query("SET LOCAL search_path TO near_agent_work,pg_catalog");
 await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='30s'");
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('near_agent_work:migration:0004',0))");
 const current=await c.query("SELECT to_regclass('near_agent_work.workflow_runs') AS runtime");
 if(current.rows[0].runtime){
  await c.query('SELECT config_bytes,config_hash,state_json,version FROM workflow_runs LIMIT 0');
  await c.query('SELECT artifact_bytes FROM deliverables LIMIT 0');
  console.log('Runtime migration already present; no changes made');
 }else{
  const tables=await c.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='near_agent_work'");invariant(tables.rows[0].n===9,'Expected reviewed nine-table foundation');
  const sql=(await readFile(new URL('../supabase/migrations/0004_execution_runtime.sql',import.meta.url),'utf8')).replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,'');
  await c.query(sql);console.log('Additive runtime migration applied: workflow_runs and private artifact bytes');
 }
 await c.query('COMMIT');
}catch(error){await c.query('ROLLBACK');console.error('Runtime migration failed; transaction rolled back; credentials omitted');process.exitCode=1;}
finally{c.release();await pool.end();}
