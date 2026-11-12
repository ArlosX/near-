import {createEvidenceStorage,EVIDENCE_BUCKET} from '../packages/database/src/evidence-storage.ts';
import {randomUUID} from 'node:crypto';
import {createDatabasePool} from '../packages/database/src/connection.ts';
import {PostgresExecutionStore} from '../packages/database/src/postgres-execution-store.ts';
import {PostgresWorkflow} from '../packages/orchestration/src/postgres-workflow.ts';
import {PostgresWorker} from '../packages/orchestration/src/postgres-worker.ts';
import {canonicalJson} from '../packages/agreements/src/agreement.ts';
import {invariant} from '../packages/shared/src/domain.ts';
// Explicit integration probe: retains one clearly synthetic order for inspection.
invariant(process.argv.includes('--write-fixture'),'Explicit --write-fixture required');
let pool=createDatabasePool();
try{
 const storage=createEvidenceStorage();await storage.ensureBucket();
 let db=new PostgresExecutionStore(pool,'near_agent_work',storage),flow=new PostgresWorkflow(db);
 const key='smoke-'+randomUUID(),created=await flow.create(key),id=created.value.orderId;
 invariant((await flow.create(key)).replayed,'creation replay failed');
 await flow.start(id,'extract',1,'smoke-start');
 const bytes=canonicalJson(await flow.template(id,'extract'));
 await flow.submit(id,'extract',bytes,2,'smoke-submit');
 invariant((await flow.submit(id,'extract',bytes,2,'smoke-submit')).replayed,'submission replay failed');
 const probe=await flow.rollbackProbe(id,3);invariant(probe.rolledBack,'rollback probe failed');
 await pool.end();pool=createDatabasePool();db=new PostgresExecutionStore(pool,'near_agent_work',storage);flow=new PostgresWorkflow(db);
 await db.enqueue(id);await db.enqueue(id);await new PostgresWorker(db).tick();
 const detail=await flow.details(id);invariant(detail.state&&typeof detail.state==='object','missing workflow state');
 invariant((detail.state as {status:string}).status==='CHECKS_PASSED_LOCAL'&&detail.reports.length===2,'workflow did not complete');
 await flow.store.artifact(id,'extract',1);await flow.store.artifact(id,'compare',1);await flow.store.report(id,detail.reports[0]!.reportHash);
 const refs=await pool.query('SELECT e.* FROM near_agent_work.evidence_objects e JOIN near_agent_work.work_orders o ON o.id=e.work_order_id WHERE o.order_key=$1',[id]);invariant(refs.rows.length===5,'missing evidence references');
 const anonymous=await fetch(process.env.SUPABASE_URL+'/storage/v1/object/public/'+EVIDENCE_BUCKET+'/'+refs.rows[0].storage_key,{signal:AbortSignal.timeout(15000)});invariant([400,401,403,404].includes(anonymous.status),'private evidence publicly accessible or privacy check unavailable');
 const row=await pool.query('SELECT status FROM near_agent_work.work_orders WHERE order_key=$1',[id]);invariant(row.rows[0].status==='APPROVED','fixture changed financial status');
 console.log(JSON.stringify({passed:true,privateEvidenceObjects:5,anonymousDownloadDenied:true,orderId:id,reports:2,reconnected:true,idempotency:true,rollback:true,financialStatus:'APPROVED',scope:'synthetic_postgres_fixture',chain:false,ai:false},null,2));
}catch{console.error('PostgreSQL integration probe failed; fixture retained for inspection; credentials omitted');process.exitCode=1;}
finally{await pool.end();}
