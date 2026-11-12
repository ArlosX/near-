import pg from 'pg';
import {readFileSync} from 'node:fs';
import {invariant} from '../../shared/src/domain.ts';
export function createDatabasePool(env:NodeJS.ProcessEnv=process.env){
 invariant(env.DATABASE_URL,'DATABASE_URL is missing');
 let url:URL;try{url=new URL(env.DATABASE_URL);}catch{throw new Error('Invalid DATABASE_URL');}
 invariant(['postgres:','postgresql:'].includes(url.protocol),'PostgreSQL connection required');
 invariant(url.hostname.endsWith('.supabase.co')||url.hostname.endsWith('.supabase.com'),'Expected a Supabase endpoint');
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
 const ca=env.DATABASE_CA_PATH?readFileSync(env.DATABASE_CA_PATH,'utf8'):undefined;
 const max=Number(env.DATABASE_POOL_MAX??2);invariant(Number.isInteger(max)&&max>=1&&max<=5,'DATABASE_POOL_MAX must be 1–5');
 const pool=new pg.Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true,servername:url.hostname,...(ca?{ca}:{})},max,statement_timeout:15000,query_timeout:20000,connectionTimeoutMillis:15000,idleTimeoutMillis:30000});
 // pg emits checked-out connection failures on the client, not only the pool.
 // Keep a provider reset from terminating the entire local HTTP server.
 pool.on('connect',client=>client.on('error',()=>console.error('PostgreSQL connection interrupted; current operation must be checked before retrying')));
 pool.on('error',()=>console.error('PostgreSQL idle connection failed; credentials omitted'));
 return pool;
}
