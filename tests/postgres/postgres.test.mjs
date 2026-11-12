import {hashBytes} from '../../packages/agreements/src/agreement.ts';
import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {PostgresStore} from '../../packages/database/src/postgres-store.ts';
import {createDemoConfig} from '../../packages/orchestration/src/demo-data.ts';
import {PostgresExecutionStore} from '../../packages/database/src/postgres-execution-store.ts';
import {PostgresWorkflow} from '../../packages/orchestration/src/postgres-workflow.ts';
import {PostgresWorker} from '../../packages/orchestration/src/postgres-worker.ts';
import {canonicalJson} from '../../packages/agreements/src/agreement.ts';
import {createConsoleServer} from '../../apps/test-console/src/server.ts';
import {WalletAuth} from '../../apps/test-console/src/wallet-auth.ts';
import {walletProof} from '../fixtures/wallet.mjs';
import {buildEvidencePackage} from '../../packages/verification/src/evidence-package.ts';
assert.equal(process.platform,'linux','Run local PostgreSQL tests inside Linux/WSL');
let pool,store,schema;
beforeEach(async()=>{
 schema='near_test_'+randomUUID().replaceAll('-','');
 // Fixed LOCAL Unix socket only. Never reads DATABASE_URL or Supabase settings.
 pool=new pg.Pool({host:'/var/run/postgresql',database:'near_agent_dev',user:'postgres',max:5,options:'-c search_path='+schema+',pg_catalog'});
 const c=await pool.connect();try{
  await c.query('CREATE SCHEMA "'+schema+'"');await c.query('SET search_path TO "'+schema+'",pg_catalog');
  for(const name of ['0001_workflow_core.sql','0002_verification_binding.sql','0003_repository_guards.sql','0004_execution_runtime.sql','0005_private_evidence.sql'])await c.query(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
 }finally{c.release();}
 store=new PostgresStore(pool,schema);
});
afterEach(async()=>{
 // Remove only the unique schema created for this test. Never enumerate or
 // delete older schemas: those may be retained evidence from another run.
 try{
  if(pool&&/^near_test_[a-f0-9]{32}$/.test(schema))await pool.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');
 }finally{await pool?.end();}
});
function config(){return createDemoConfig('pg-'+randomUUID(),BigInt(Date.now())*1000000n,'2500');}
async function create(c=config(),key=randomUUID(),hook){return store.createApproved(c.agreement,c.policies,c.sources,c.agreement.clientAccountId,key,BigInt(Date.now())*1000000n,hook);}
async function count(table){return Number((await pool.query('SELECT count(*) AS n FROM '+table)).rows[0].n);}
test('PostgreSQL migrations and repository commit a bound approved graph and exact large integer values',async()=>{
 const c=config(),r=await create(c);const row=await store.getOwned(r.value.id,c.agreement.clientAccountId);
 assert.equal(row.status,'APPROVED');assert.equal(row.total_amount_atomic,'100');assert.equal(row.result_cutoff_ns,c.agreement.resultCutoffNs);
 assert.equal(row.snapshot.agreement.orderId,c.agreement.orderId);assert.equal(await count('subtasks'),2);assert.equal(await count('task_dependencies'),1);assert.equal(await count('execution_events'),1);
 assert.equal(await count('jobs'),0); // Approval never implies chain funding or worker execution.
});
test('PostgreSQL atomically rolls back snapshot, tasks, policy, event and command result on fault',async()=>{
 await assert.rejects(()=>create(config(),randomUUID(),()=>{throw new Error('injected rollback');}),/injected rollback/);
 for(const table of ['work_orders','subtasks','verification_policies','execution_events','command_results'])assert.equal(await count(table),0);
});
test('concurrent identical create requests commit one graph and conflicting request payload is rejected',async()=>{
 const c=config(),key=randomUUID();const result=await Promise.all([create(c,key),create(c,key)]);
 assert.equal(result[0].value.id,result[1].value.id);assert.deepEqual(result.map(x=>x.replayed).sort(),[false,true]);assert.equal(await count('work_orders'),1);
 await assert.rejects(()=>create(config(),key),/idempotency key reused/);assert.equal(await count('work_orders'),1);
});
test('ownership, source/policy binding and SQL immutability hold on the real server',async()=>{
 const c=config(),r=await create(c);await assert.rejects(()=>store.getOwned(r.value.id,'intruder.testnet'),/not owned/);
 await assert.rejects(()=>pool.query("UPDATE work_orders SET client_account_id='intruder.testnet' WHERE id=$1",[r.value.id]),/Immutable approved snapshot/);
 await assert.rejects(()=>pool.query("UPDATE verification_policies SET policy_json='{}'"),/Immutable verification record/);
 await assert.rejects(()=>pool.query("UPDATE subtasks SET recipient_account_id='intruder.testnet'"),/Immutable subtask allocation/);
 await assert.rejects(()=>pool.query('DELETE FROM task_dependencies'),/Immutable verification record/);
 await assert.rejects(()=>pool.query('INSERT INTO task_dependencies SELECT work_order_id,successor_id,predecessor_id FROM task_dependencies'),/not in approved agreement/);
 await assert.rejects(()=>pool.query('DELETE FROM execution_events'),/Immutable verification record/);
 const changed=structuredClone(c.sources);changed[0].text='modified';await assert.rejects(()=>store.createApproved(c.agreement,c.policies,changed,c.agreement.clientAccountId,randomUUID(),BigInt(Date.now())*1000000n),/source manifest mismatch/);
});
test('RLS denies a granted reader role access to another user order by default',async()=>{
 await create();const c=await pool.connect();const role='near_reader_'+randomUUID().replaceAll('-','');
 try{await c.query('BEGIN');await c.query('CREATE ROLE "'+role+'" NOLOGIN');await c.query('GRANT USAGE ON SCHEMA "'+schema+'" TO "'+role+'"');await c.query('GRANT SELECT ON ALL TABLES IN SCHEMA "'+schema+'" TO "'+role+'"');await c.query('SET LOCAL ROLE "'+role+'"');assert.equal((await c.query('SELECT * FROM work_orders')).rows.length,0);}finally{await c.query('ROLLBACK');c.release();}
});
test('job enqueue is idempotent and two connections cannot claim the same job',async()=>{
 const r=await create();const first=await store.enqueueReconciliation(r.value.id,'reconcile',{network:'testnet'});const replay=await store.enqueueReconciliation(r.value.id,'reconcile',{network:'testnet'});assert.equal(first.id,replay.id);
 await assert.rejects(()=>store.enqueueReconciliation(r.value.id,'reconcile',{network:'wrong'}),/payload conflict/);
 const leases=await Promise.all([store.claimJob(),store.claimJob()]);assert.equal(leases.filter(Boolean).length,1);
 const lease=leases.find(Boolean);await store.withJobLease(lease,async c=>{await c.query("INSERT INTO execution_events(event_key,work_order_id,event_type,payload) VALUES($1,$2,'test.job','{}')",[lease.id,lease.orderId]);return true;},true);
 assert.equal((await pool.query('SELECT status FROM jobs')).rows[0].status,'completed');
});
test('expired lease is reclaimed with a new token and stale writes are rejected',async()=>{
 const r=await create();await store.enqueueReconciliation(r.value.id,'lease',{});const old=await store.claimJob();
 // Disclosed clock fixture; the real SQL claim and fencing checks use server time.
 await pool.query("UPDATE jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[old.id]);const next=await store.claimJob();assert.notEqual(next.token,old.token);assert.equal(next.attempt,2);
 await assert.rejects(()=>store.withJobLease(old,async()=>true,true),/stale job lease/);await store.withJobLease(next,async()=>true,true);
});
test('expired completion rolls back its event and attempt budgets cannot be reset',async()=>{
 const r=await create();await store.enqueueReconciliation(r.value.id,'cap',{},1);const lease=await store.claimJob(1);
 await assert.rejects(()=>store.withJobLease(lease,async c=>{
  await c.query("INSERT INTO execution_events(event_key,work_order_id,event_type,payload) VALUES($1,$2,'must.rollback','{}')",[lease.id,lease.orderId]);await c.query('SELECT pg_sleep(1.1)');return true;
 },true),/expired before commit/);
 assert.equal(await count('execution_events'),1);assert.equal(await store.claimJob(),null);assert.equal((await pool.query('SELECT status FROM jobs')).rows[0].status,'failed');
 await store.enqueueReconciliation(r.value.id,'cap',{},1);assert.equal(await store.claimJob(),null);
});

function execution(){const db=new PostgresExecutionStore(pool,schema);return {db,flow:new PostgresWorkflow(db),worker:new PostgresWorker(db)};}
async function submitTask(flow,id,task,bad=false){let d=await flow.details(id);await flow.start(id,task,d.version,randomUUID());d=await flow.details(id);const artifact=await flow.template(id,task);if(bad)artifact.suppliers[0].totalMinor='999';const key=randomUUID(),bytes=canonicalJson(artifact);const result=await flow.submit(id,task,bytes,d.version,key);return {result,key,bytes,version:d.version};}
test('PostgreSQL full workflow survives new service and preserves reports without claiming funding',async()=>{
 let {db,flow}=execution();const created=await flow.create(randomUUID()),id=created.value.orderId;
 const first=await submitTask(flow,id,'extract');assert.equal(first.result.value.decision,'accepted');
 ({db,flow}=execution());const second=await submitTask(flow,id,'compare');assert.equal(second.result.value.decision,'accepted');
 const replay=await flow.submit(id,'compare',second.bytes,second.version,second.key);assert.equal(replay.replayed,true);
 const d=await flow.details(id);assert.equal(d.state.status,'CHECKS_PASSED_LOCAL');assert.equal(d.reports.length,2);assert.equal(await count('deliverables'),2);
 assert.equal((await pool.query('SELECT status FROM work_orders')).rows[0].status,'APPROVED');
 assert.deepEqual((await pool.query('SELECT DISTINCT status FROM subtasks')).rows.map(r=>r.status),['SUBMITTED']);
 assert.equal((await flow.rollbackProbe(id,d.version)).rolledBack,true);
 const evidence=await buildEvidencePackage(db,id);
 assert.equal(evidence.content.deliveries.length,2);
 assert.equal(evidence.content.deliveries[1].artifactBytes,second.bytes);
 assert.equal(evidence.content.trust.onChainAcceptance,'not-established-by-this-export');
});
test('PostgreSQL persisted revision limit blocks dependent work and survives reconnect',async()=>{
 const {flow}=execution(),id=(await flow.create(randomUUID())).value.orderId;
 assert.equal((await submitTask(flow,id,'extract',true)).result.value.decision,'revision_required');
 const next=execution().flow;assert.equal((await submitTask(next,id,'extract',true)).result.value.decision,'rejected');
 const d=await next.details(id);assert.equal(d.state.status,'FAILED_LOCAL');assert.equal(d.state.tasks.compare.status,'BLOCKED_LOCAL');assert.equal(d.reports.length,2);
 await assert.rejects(()=>next.start(id,'compare',d.version,randomUUID()),/terminal local/);
});
test('PostgreSQL worker resumes committed step after crash with no duplicate reports or reconciliation claims',async()=>{
 const {db,flow,worker}=execution(),id=(await flow.create(randomUUID())).value.orderId;
 await db.enqueue(id);await db.enqueue(id);
 const approved=(await pool.query('SELECT id FROM work_orders')).rows[0];await store.enqueueReconciliation(approved.id,'chain',{});
 await assert.rejects(()=>worker.tick(()=>{throw new Error('simulated process crash');}),/simulated process crash/);
 assert.equal((await flow.details(id)).state.tasks.extract.status,'IN_PROGRESS');
 await pool.query("UPDATE jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE job_type='fixture_execution'");
 const restarted=execution();assert.equal(await restarted.worker.tick(),true);
 const d=await restarted.flow.details(id);assert.equal(d.reports.length,2);assert.equal(d.state.status,'CHECKS_PASSED_LOCAL');
 assert.equal((await pool.query("SELECT status FROM jobs WHERE job_type='fixture_execution'")).rows[0].status,'completed');
 assert.equal((await pool.query("SELECT status FROM jobs WHERE job_type='reconcile_chain'")).rows[0].status,'queued');
 assert.equal(await restarted.worker.tick(),false);
});
test('PostgreSQL commands reject concurrent stale versions and roll back partial submission writes',async()=>{
 const {db,flow}=execution(),id=(await flow.create(randomUUID())).value.orderId;
 const concurrent=await Promise.allSettled([flow.start(id,'extract',1,randomUUID()),flow.start(id,'extract',1,randomUUID())]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
 const d=await flow.details(id),artifact=canonicalJson(await flow.template(id,'extract'));
 // Inject after deliverable/report writes through the real repository, before outer COMMIT.
 const save=db.save.bind(db);db.save=async()=>{throw new Error('injected submission fault');};
 await assert.rejects(()=>flow.submit(id,'extract',artifact,d.version,'fault'),/injected submission fault/);
 assert.equal(await count('deliverables'),0);assert.equal(await count('verification_reports'),0);assert.equal((await flow.details(id)).version,d.version);
 db.save=save;await flow.submit(id,'extract',artifact,d.version,'fault');assert.equal(await count('verification_reports'),1);
});
test('loopback HTTP console performs workflow commands against actual PostgreSQL',async()=>{
 const {db,flow}=execution(),server=createConsoleServer(db,flow);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const base='http://127.0.0.1:'+server.address().port;assert.equal((await (await fetch(base+'/api/health')).json()).database,'postgres');
 const response=await fetch(base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Console':'1'},body:JSON.stringify({requestId:randomUUID(),budgetMinor:'2500',lifetimeSeconds:3600})});assert.equal(response.status,200);const id=(await response.json()).value.orderId;
 const loaded=await (await fetch(base+'/api/orders/'+id)).json();assert.equal(loaded.version,1);assert.equal(loaded.config.agreement.orderId,id);assert.equal(await count('workflow_runs'),1);
 }finally{await new Promise(r=>server.close(r));}
});

test('authenticated HTTP blocks cross-owner requests and revoked keys before database writes',async()=>{
 let revoked=false;
 const {db,flow}=execution(),auth=new WalletAuth(async()=>!revoked),server=createConsoleServer(db,flow,auth);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const headers={'Content-Type':'application/json','X-Local-Console':'1',Origin:base};
 async function login(account){
  const response=await fetch(base+'/api/auth/challenge',{method:'POST',headers,body:'{}'});
  const challenge=await response.json();
  const result=await fetch(base+'/api/auth/login',{method:'POST',headers:{...headers,Cookie:'near_challenge='+challenge.state},body:JSON.stringify(walletProof(challenge,account))});
  assert.equal(result.status,200);
  return result.headers.getSetCookie().find(value=>value.startsWith('near_session=')).split(';')[0];
 }
 try{
  const alice=await login('alice.testnet'),bob=await login('bob.testnet');
  const response=await fetch(base+'/api/orders',{method:'POST',headers:{...headers,Cookie:alice},body:JSON.stringify({requestId:'auth-order',budgetMinor:'2500',lifetimeSeconds:3600})});
  assert.equal(response.status,200);const id=(await response.json()).value.orderId;
  assert.equal((await fetch(base+'/api/orders/'+id,{headers:{Cookie:bob}})).status,400);
  assert.equal((await fetch(base+'/api/orders/'+id+'/evidence-package',{headers:{Cookie:bob}})).status,400);
  assert.equal((await fetch(base+'/api/orders/'+id+'/evidence-package')).status,401);
  const ownEvidence=await fetch(base+'/api/orders/'+id+'/evidence-package',{headers:{Cookie:alice}});
  assert.equal(ownEvidence.status,200);
  assert.equal((await ownEvidence.json()).content.agreement.clientAccountId,'alice.testnet');
  assert.equal((await fetch(base+'/api/orders/'+id+'/start',{method:'POST',headers:{...headers,Cookie:bob},body:JSON.stringify({taskId:'extract',expectedVersion:1,requestId:'foreign'})})).status,400);
  revoked=true;
  assert.equal((await fetch(base+'/api/orders/'+id+'/start',{method:'POST',headers:{...headers,Cookie:alice},body:JSON.stringify({taskId:'extract',expectedVersion:1,requestId:'revoked'})})).status,401);
  assert.equal((await new PostgresWorkflow(db.forActor('alice.testnet')).details(id)).version,1);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('configured private storage never silently falls back to missing source evidence',async()=>{
 const {flow}=execution(),id=(await flow.create(randomUUID())).value.orderId;
 const storage={get:async()=>{throw new Error('must not fetch absent reference');},put:async()=>{throw new Error('not writing');}};
 const db=new PostgresExecutionStore(pool,schema,storage);
 await assert.rejects(()=>db.load(id),/Source evidence reference missing/);
});

test('runtime config is immutable, RLS applies and failed creation leaves no approved orphan',async()=>{
 const {db,flow}=execution(),event=db.event.bind(db);db.event=async()=>{throw new Error('creation crash');};
 await assert.rejects(()=>flow.create(randomUUID()),/creation crash/);
 for(const table of ['work_orders','workflow_runs','subtasks','command_results','execution_events'])assert.equal(await count(table),0);
 db.event=event;await flow.create(randomUUID());await assert.rejects(()=>pool.query("UPDATE workflow_runs SET config_bytes='{}'"),/Immutable workflow configuration/);
 const c=await pool.connect(),role='runtime_reader_'+randomUUID().replaceAll('-','');
 try{await c.query('BEGIN');await c.query('CREATE ROLE "'+role+'" NOLOGIN');await c.query('GRANT USAGE ON SCHEMA "'+schema+'" TO "'+role+'"');await c.query('GRANT SELECT ON workflow_runs TO "'+role+'"');await c.query('SET LOCAL ROLE "'+role+'"');assert.equal((await c.query('SELECT * FROM workflow_runs')).rows.length,0);}finally{await c.query('ROLLBACK');c.release();}
});

test('expired PostgreSQL worker records expiry without fabricating reports or refunds',async()=>{
 const {db,flow}=execution(),id=(await flow.create(randomUUID())).value.orderId;await db.enqueue(id);
 const cutoff=BigInt((await flow.details(id)).config.agreement.resultCutoffNs);
 await new PostgresWorker(db,()=>Number(cutoff/1000000n)+1000).tick();
 const d=await flow.details(id);assert.equal(d.state.status,'EXPIRED_LOCAL');assert.equal(d.reports.length,0);assert.equal((await pool.query('SELECT status FROM work_orders')).rows[0].status,'APPROVED');
});

test('private evidence integrates source/artifact/report versions and rolls back metadata on upload failure',async()=>{
 const files=new Map();let fail=false;
 const storage={put:async(scope,bytes)=>{if(fail)throw new Error('storage unavailable');const hash=hashBytes(bytes),key=scope+'/'+hash.slice(7)+'.json';files.set(key,bytes);return {key,hash,size:Buffer.byteLength(bytes)};},get:async(key,hash)=>{const bytes=files.get(key);assert.equal(hashBytes(bytes),hash);return bytes;}};
 const db=new PostgresExecutionStore(pool,schema,storage),flow=new PostgresWorkflow(db),id=(await flow.create(randomUUID())).value.orderId;
 assert.equal(await count('evidence_objects'),1);await flow.start(id,'extract',1,'start');const bytes=canonicalJson(await flow.template(id,'extract'));
 fail=true;await assert.rejects(()=>flow.submit(id,'extract',bytes,2,'submit'),/storage unavailable/);assert.equal(await count('deliverables'),0);assert.equal(await count('verification_reports'),0);assert.equal(await count('evidence_objects'),1);assert.equal((await flow.details(id)).version,2);
 fail=false;await flow.submit(id,'extract',bytes,2,'submit');await submitTask(flow,id,'compare');const d=await flow.details(id);assert.equal(d.reports.length,2);assert.equal(await count('evidence_objects'),5);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM deliverables WHERE artifact_bytes IS NOT NULL')).rows[0].n,0);
 assert.equal((await db.artifact(id,'extract',1)).bytes,bytes);assert.equal((await db.report(id,d.reports[0].reportHash)).reportHash,d.reports[0].reportHash);
 await assert.rejects(()=>pool.query("UPDATE evidence_objects SET storage_key='changed'"),/Immutable verification/);
});

test('wallet account scopes protect reads, writes, reports and jobs across accounts',async()=>{
 const alice=new PostgresExecutionStore(pool,schema,undefined,'alice.testnet');
 const bob=alice.forActor('bob.testnet');
 const a=new PostgresWorkflow(alice),b=new PostgresWorkflow(bob);
 const order=(await a.create('same-request')).value.orderId;
 const other=(await b.create('same-request')).value.orderId;
 assert.notEqual(order,other);
 assert.deepEqual((await bob.list()).map(row=>row.id),[other]);
 await assert.rejects(()=>b.details(order),/order not found/);
 await assert.rejects(()=>b.start(order,'extract',1,'foreign-write'),/order not found/);
 await assert.rejects(()=>bob.enqueue(order),/order not found/);
 await alice.enqueue(order);
 await new PostgresWorker(bob).tick();
 const detail=await a.details(order);
 assert.equal(detail.reports.length,2);
 await assert.rejects(()=>bob.report(order,detail.reports[0].reportHash),/order not found/);
});

test('targeted model execution verifies two PostgreSQL artifacts and replays without another call',async()=>{
 const {runPostgresModel}=await import('../../packages/orchestration/src/postgres-model-run.ts');
 const {db,flow}=execution();
 const id=(await flow.create(randomUUID())).value.orderId;
 let calls=0;
 const adapter={
  settings:{model:'test-double'},
  request:input=>({task:input.taskId}),
  complete:async request=>{calls++;return {content:JSON.stringify(await flow.template(id,request.task),null,2),requestId:null,usage:null,finishReason:'stop'};}
 };
 await assert.rejects(()=>runPostgresModel(db,adapter,id),/confirmed Testnet deposit/);
 assert.equal(calls,0);
 // Simulate the already-verified funding transition in this isolated schema.
 await pool.query("UPDATE work_orders SET status='FUNDED' WHERE order_key=$1",[id]);
 const result=await runPostgresModel(db,adapter,id);
 assert.equal(result.status,'CHECKS_PASSED_LOCAL');
 assert.deepEqual(result.reports.map(r=>r.report.taskId),['extract','compare']);
 assert.equal(calls,2);
 await runPostgresModel(db,adapter,id);
 assert.equal(calls,2);
});
test('an ambiguous provider failure leaves a durable reservation and prevents duplicate billing',async()=>{
 const {runPostgresModel}=await import('../../packages/orchestration/src/postgres-model-run.ts');
 const {db,flow}=execution();
 const id=(await flow.create(randomUUID())).value.orderId;
 await pool.query("UPDATE work_orders SET status='FUNDED' WHERE order_key=$1",[id]);
 let calls=0;
 const adapter={settings:{model:'test-double'},request:()=>({}),complete:async()=>{calls++;throw new Error('provider timeout');}};
 await assert.rejects(()=>runPostgresModel(db,adapter,id),/provider timeout/);
 await assert.rejects(()=>runPostgresModel(db,adapter,id),/already reserved/);
 assert.equal(calls,1);
 assert.equal((await flow.details(id)).reports.length,0);
 await assert.rejects(()=>runPostgresModel(db,adapter,id,{retryUnansweredOnce:true}),/provider timeout/);
 assert.equal(calls,2);
 await assert.rejects(()=>runPostgresModel(db,adapter,id,{retryUnansweredOnce:true}),/recovery was already used/);
 assert.equal(calls,2);
});

test('TEE model execution stops after one result and cannot unlock comparison from local acceptance',async()=>{
 const {runPostgresModel}=await import('../../packages/orchestration/src/postgres-model-run.ts');
 const db=new PostgresExecutionStore(pool,schema,undefined,'owner.testnet','escrow.testnet','owner.testnet','outlayer-tdx-direct-v1');
 const flow=new PostgresWorkflow(db),id=(await flow.create(randomUUID())).value.orderId;
 assert.equal((await db.load(id)).config.verificationMode,'outlayer-tdx-direct-v1');
 assert.equal(db.forActor('other.testnet').verificationMode,'outlayer-tdx-direct-v1');
 assert.equal((await db.getFundingIntent(id)).methodName,'create_tee_work_order');
 await assert.rejects(()=>db.enqueue(id),/synthetic queue/);
 await assert.rejects(()=>db.checkSettlement(id),/Confirmed TEE funding required/);
 await pool.query("UPDATE work_orders SET status='FUNDED' WHERE order_key=$1",[id]);
 // This test double isolates runner behavior. Production uses finalized chain
 // views; the pure guard tests separately cover pending/revision/dependency checks.
 let calls=0,chainAccepted=false;
 db.assertTeeReady=async(_order,task)=>{assert.ok(task==='extract'||chainAccepted,'On-chain dependency still locked');};
 const adapter={settings:{model:'test-double'},request:input=>({task:input.taskId}),complete:async request=>{calls++;return {content:JSON.stringify(await flow.template(id,request.task)),requestId:null,usage:null,finishReason:'stop'};}};
 assert.equal((await runPostgresModel(db,adapter,id)).status,'AWAITING_TEE');
 assert.equal(calls,1);assert.equal((await db.details(id)).reports.length,1);
 await assert.rejects(()=>runPostgresModel(db,adapter,id),/On-chain dependency still locked/);assert.equal(calls,1);
 chainAccepted=true;
 assert.equal((await runPostgresModel(db,adapter,id)).status,'AWAITING_TEE');assert.equal(calls,2);
});
