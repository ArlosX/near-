import {TEE_PROFILE,readFinalTeeOrder,assertTeeTaskReady,planTeeTask} from '../../agreements/src/tee-settlement.ts';
import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {canonicalJson,hash,hashBytes} from '../../agreements/src/agreement.ts';
import {fundingIntent} from '../../agreements/src/agreement.ts';
import {nextSettlementIntent} from '../../agreements/src/settlement-intent.ts';
import {readFinalEscrowOrder,readFinalRefund} from '../../agreements/src/refund-confirmation.ts';
import {readFinalTestnetFunding} from '../../agreements/src/funding-confirmation.ts';
import {invariant} from '../../shared/src/domain.ts';
import {verifyReportIntegrity} from '../../verification/src/report.ts';
import type {ReportEnvelope} from '../../verification/src/report.ts';
import {recheckSettlementEvidence} from '../../verification/src/settlement-evidence.ts';
import type {DemoConfig} from '../../orchestration/src/demo-data.ts';
import {PostgresStore} from './postgres-store.ts';
import type {SqlClient,SqlPool,JobLease} from './postgres-store.ts';
import type {EvidenceStorage} from './evidence-storage.ts';

// Loopback fixture execution only, until wallet auth and chain reconciliation exist.
// No method here updates work_orders.status or on-chain acceptance.
type RunState={scope:string;status:string;tasks:Record<string,{status:string;revisions:number}>};
type Context={client:SqlClient;lease?:JobLease};
export class PostgresExecutionStore {
 private context=new AsyncLocalStorage<Context>();
 private pool:SqlPool;private schema:string;private core:PostgresStore;private storage:EvidenceStorage|undefined;
 readonly verificationMode:'outlayer-tdx-direct-v1'|undefined;
 readonly actor:string;
 readonly contractId:string;
 readonly settlementAccount:string|undefined;
 constructor(pool:SqlPool,schema='near_agent_work',storage?:EvidenceStorage,actor='demo-client.testnet',readonlyContract='undeployed-escrow.testnet',settlementAccount?:string,verificationMode?:'outlayer-tdx-direct-v1'){
  invariant(/^[a-z][a-z0-9_]{0,62}$/.test(schema),'invalid database schema');
  this.pool=pool;this.schema=schema;this.core=new PostgresStore(pool,schema);this.storage=storage;this.actor=actor;this.contractId=readonlyContract;this.settlementAccount=settlementAccount;this.verificationMode=verificationMode;
 }
 private async connection(){const c=await this.pool.connect();try{await c.query('SET search_path TO "'+this.schema+'",pg_catalog');await c.query("SET statement_timeout='15s'");await c.query("SET lock_timeout='5s'");return c;}catch(e){c.release();throw e;}}
 private async query(sql:string,values:unknown[]=[]){const active=this.context.getStore();if(active)return active.client.query(sql,values);const c=await this.connection();try{return await c.query(sql,values);}finally{c.release();}}
 private async owned(orderId:string){const row=(await this.query("SELECT o.*,r.config_bytes,r.config_hash,r.state_json,r.version AS run_version FROM work_orders o JOIN workflow_runs r ON r.work_order_id=o.id WHERE o.order_key=$1 AND o.client_account_id=$2",[orderId,this.actor])).rows[0];invariant(row,'order not found');return row;}
 async execute<T>(operation:string,orderId:string,requestId:string,payload:unknown,fn:()=>Promise<T>,beforeCommit?:()=>void){
  const fingerprint=hash({operation,payload}),key='workflow:'+orderId+':'+requestId;
  const run=async()=>{
   const c=this.context.getStore()!.client;
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[this.actor+':'+key]);
   // Serialize distinct commands for one order, including optimistic version checks.
   await c.query('SELECT o.id FROM work_orders o WHERE order_key=$1 AND client_account_id=$2 FOR UPDATE',[orderId,this.actor]);
   const cached=(await c.query('SELECT fingerprint,result_json FROM command_results WHERE actor_account_id=$1 AND request_id=$2',[this.actor,key])).rows[0];
   if(cached){invariant(cached.fingerprint===fingerprint,'idempotency key reused for different payload');return {value:cached.result_json as T,replayed:true,transactionId:key};}
   const value=await fn(),row=await this.owned(orderId);
   await c.query('INSERT INTO command_results(actor_account_id,request_id,work_order_id,fingerprint,result_json,operation) VALUES($1,$2,$3,$4,$5,$6)',[this.actor,key,row.id,fingerprint,canonicalJson(value),operation]);
   beforeCommit?.();return {value,replayed:false,transactionId:key};
  };
  if(this.context.getStore())return run();
  const c=await this.connection();try{await c.query('BEGIN');const value=await this.context.run({client:c},run);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async create(orderId:string,input:unknown,state:unknown){
  const config=input as DemoConfig;invariant(config.agreement.orderId===orderId&&config.agreement.clientAccountId===this.actor,'fixture owner mismatch');
  const c=this.context.getStore()?.client;invariant(c,'creation requires transaction');
  const result=await this.core.createApproved(config.agreement,config.policies,config.sources,this.actor,hash({orderId}).slice(7),BigInt(Date.now())*1000000n,undefined,c);
  const id=(result.value as {id:string}).id;
  await c.query('INSERT INTO workflow_runs(work_order_id,config_bytes,config_hash,state_json) VALUES($1,$2,$3,$4)',[id,canonicalJson(config),hash(config),canonicalJson(state)]);
  await this.archive(id,'sources','',0,canonicalJson(config.sources));
 }
 private async archive(orderId:string,kind:'sources'|'artifacts'|'reports',task:string,version:number,bytes:string){
  if(!this.storage)return null;
  const scope=orderId+'/'+kind+(kind==='sources'?'':'/'+task+'/'+version);
  const ref=await this.storage.put(scope,bytes);invariant(ref.hash===hashBytes(bytes),'evidence upload binding mismatch');
  await this.query('INSERT INTO evidence_objects(work_order_id,kind,task_key,version,storage_key,content_hash,byte_count) VALUES($1,$2,$3,$4,$5,$6,$7)',[orderId,kind,task,version,ref.key,ref.hash,ref.size]);return ref;
 }
 async load(orderId:string){const row=await this.owned(orderId);const config=JSON.parse(String(row.config_bytes)) as DemoConfig;invariant(hash(config)===row.config_hash,'persisted config hash mismatch');const snapshot=JSON.parse(String(row.snapshot_bytes));invariant(hash(snapshot)===row.snapshot_hash&&hash({agreement:config.agreement,policies:config.policies,sources:config.sources})===row.snapshot_hash,'approved snapshot mismatch');if(this.storage){const ref=(await this.query("SELECT storage_key,content_hash FROM evidence_objects WHERE work_order_id=$1 AND kind='sources'",[row.id])).rows[0];invariant(ref,'Source evidence reference missing');{const bytes=await this.storage.get(String(ref.storage_key),String(ref.content_hash));invariant(hashBytes(bytes)===config.agreement.sourceManifestHash&&bytes===canonicalJson(config.sources),'source evidence mismatch');}}return {config,state:row.state_json,version:Number(row.run_version)};}
 async save(orderId:string,state:unknown,expectedVersion:number){
  invariant(this.context.getStore(),'save requires transaction');const row=await this.owned(orderId);
  const changed=await this.query('UPDATE workflow_runs SET state_json=$1,version=version+1 WHERE work_order_id=$2 AND version=$3',[canonicalJson(state),row.id,expectedVersion]);invariant(changed.rowCount===1,'stale order version');
  // ACCEPTED in the financial task table is deliberately never written by fixture checks.
  for(const [key,t]of Object.entries((state as RunState).tasks)){
   const status=t.status==='CHECKS_PASSED_LOCAL'?'SUBMITTED':t.status==='BLOCKED_LOCAL'?'BLOCKED':t.status;
   await this.query('UPDATE subtasks SET status=$1,revision_count=$2 WHERE work_order_id=$3 AND task_key=$4',[status,t.revisions,row.id,key]);
  }
 }
 async event(orderId:string,key:string,type:string,payload:unknown){const row=await this.owned(orderId);await this.query('INSERT INTO execution_events(event_key,work_order_id,event_type,payload) VALUES($1,$2,$3,$4)',[orderId+':'+key,row.id,type,canonicalJson(payload)]);}
 async submission(orderId:string,taskId:string,version:number,bytes:string,envelope:ReportEnvelope){
  invariant(this.context.getStore(),'submission requires transaction');const r=envelope.report;
  invariant(verifyReportIntegrity(envelope)&&r.orderId===orderId&&r.taskId===taskId&&r.artifactVersion===version&&r.artifactHash===hashBytes(bytes),'report artifact binding mismatch');
  const row=await this.owned(orderId);invariant(r.agreementHash===row.agreement_hash,'report agreement mismatch');
  const task=(await this.query('SELECT id,verification_policy_hash FROM subtasks WHERE work_order_id=$1 AND task_key=$2',[row.id,taskId])).rows[0];invariant(task&&task.verification_policy_hash===r.policyHash,'report policy mismatch');
  const archived=await this.archive(String(row.id),'artifacts',taskId,version,bytes);
  await this.archive(String(row.id),'reports',taskId,version,canonicalJson(envelope));
  const id=randomUUID();await this.query('INSERT INTO deliverables(id,subtask_id,version,storage_key,content_hash,artifact_bytes) VALUES($1,$2,$3,$4,$5,$6)',[id,task.id,version,archived?.key??'postgres:'+id,r.artifactHash,archived?null:bytes]);
  await this.query("INSERT INTO verification_reports(subtask_id,deliverable_id,agreement_hash,policy_hash,report_hash,decision,checks_json,source_manifest_hash,artifact_hash,artifact_version,revision,scope,report_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'deterministic_only',$12)",[task.id,id,r.agreementHash,r.policyHash,envelope.reportHash,r.decision,canonicalJson(r.checks),r.sourceManifestHash,r.artifactHash,r.artifactVersion,r.revision,canonicalJson(envelope)]);
 }
 async artifact(orderId:string,taskId:string,version:number){const o=await this.owned(orderId);const row=(await this.query('SELECT d.artifact_bytes,d.content_hash,d.storage_key FROM deliverables d JOIN subtasks t ON t.id=d.subtask_id WHERE t.work_order_id=$1 AND t.task_key=$2 AND d.version=$3',[o.id,taskId,version])).rows[0];invariant(row,'artifact not found');let bytes:string;if(String(row.storage_key).startsWith('postgres:')){invariant(typeof row.artifact_bytes==='string','legacy artifact unavailable');bytes=row.artifact_bytes;}else{invariant(this.storage,'private evidence storage required');bytes=await this.storage.get(String(row.storage_key),String(row.content_hash));}invariant(hashBytes(bytes)===row.content_hash,'artifact integrity mismatch');return {bytes,hash:String(row.content_hash)};}
 async list(){const rows=(await this.query("SELECT o.order_key,r.state_json,r.version FROM work_orders o JOIN workflow_runs r ON r.work_order_id=o.id WHERE o.client_account_id=$1 ORDER BY o.created_at DESC,o.id DESC LIMIT 100",[this.actor])).rows;return rows.map(r=>({id:String(r.order_key),state:r.state_json,version:Number(r.version)}));}
 async details(orderId:string){
  const load=async()=>{
   const snapshot=await this.load(orderId),o=await this.owned(orderId);
   const reports=(await this.query('SELECT r.report_json FROM verification_reports r JOIN subtasks t ON t.id=r.subtask_id WHERE t.work_order_id=$1 ORDER BY r.created_at,r.id',[o.id])).rows.map(r=>r.report_json as ReportEnvelope);
   invariant(reports.every(verifyReportIntegrity),'persisted report integrity mismatch');
   const events=(await this.query('SELECT * FROM execution_events WHERE work_order_id=$1 ORDER BY id',[o.id])).rows.map(r=>({seq:Number(r.id),type:String(r.event_type),payload:r.payload}));
   const transactions=(await this.query('SELECT request_id,operation,created_at FROM command_results WHERE work_order_id=$1 ORDER BY created_at,request_id',[o.id])).rows.map(r=>({tx_id:String(r.request_id),operation:String(r.operation),outcome:'COMMITTED',created_at:r.created_at,detail:'Atomic PostgreSQL command; not a NEAR transaction'}));
   return {...snapshot,orderId,financialStatus:o.status,reports,events,transactions,job:await this.job(orderId),modelCalls:[]};
  };
  if(this.context.getStore())return load();
  const c=await this.connection();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const value=await this.context.run({client:c},load);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async report(orderId:string,reportHash:string){const d=await this.details(orderId);const result=d.reports.find(r=>r.reportHash===reportHash);invariant(result,'report not found');const o=await this.owned(orderId);if(this.storage){const ref=(await this.query("SELECT storage_key,content_hash FROM evidence_objects WHERE work_order_id=$1 AND kind='reports' AND task_key=$2 AND version=$3",[o.id,result.report.taskId,result.report.artifactVersion])).rows[0];invariant(ref,'Report evidence reference missing');invariant(await this.storage.get(String(ref.storage_key),String(ref.content_hash))===canonicalJson(result),'report evidence mismatch');}return result;}
 async counts(orderId:string){const row=await this.owned(orderId);const result=(await this.query('SELECT (SELECT count(*) FROM deliverables d JOIN subtasks t ON t.id=d.subtask_id WHERE t.work_order_id=$1)::int AS artifacts,(SELECT count(*) FROM verification_reports r JOIN subtasks t ON t.id=r.subtask_id WHERE t.work_order_id=$1)::int AS reports,(SELECT count(*) FROM execution_events WHERE work_order_id=$1)::int AS events,(SELECT count(*) FROM command_results WHERE work_order_id=$1)::int AS requests',[row.id])).rows[0]!;return result;}
 async enqueue(orderId:string){invariant(!(await this.load(orderId)).config.verificationMode,'TEE orders cannot run synthetic queue jobs');const row=await this.owned(orderId);return this.core.enqueueExecution(String(row.id));}
 async job(orderId:string){const row=await this.owned(orderId);return (await this.query("SELECT * FROM jobs WHERE work_order_id=$1 AND job_type='fixture_execution'",[row.id])).rows[0]??null;}
 async claim(){return this.core.claimJob(60,'fixture_execution');}
 async withLease<T>(lease:JobLease,fn:()=>Promise<T>,complete=false){return this.core.withJobLease(lease,c=>this.context.run({client:c,lease},fn),complete,60);}
 forActor(actor:string){return new PostgresExecutionStore(this.pool,this.schema,this.storage,actor,this.contractId,this.settlementAccount,this.verificationMode);}
 async jobOwner(lease:JobLease){return this.withLease(lease,async()=>{const row=(await this.query('SELECT client_account_id FROM work_orders WHERE id=$1',[lease.orderId])).rows[0];invariant(row,'order not found');return String(row.client_account_id);});}
 async getFundingIntent(orderId:string){
  const {config}=await this.load(orderId);
  const row=await this.owned(orderId);
  invariant(config.agreement.contractId===this.contractId&&this.contractId!=='undeployed-escrow.testnet','Create a new order for the deployed escrow');
  invariant(row.status==='APPROVED','Order is already funded or unavailable');
  invariant(BigInt(config.agreement.resultCutoffNs)>BigInt(Date.now())*1000000n,'Order funding deadline passed');
  return fundingIntent(config.agreement,config.verificationMode);
 }
 async confirmFunding(orderId:string,txHash:string){
  const {config}=await this.load(orderId);
  invariant(config.agreement.contractId===this.contractId,'Wrong escrow deployment');
  const proof=await readFinalTestnetFunding(config.agreement,txHash,config.verificationMode);
  if(config.verificationMode===TEE_PROFILE)await readFinalTeeOrder(config.agreement);
  return this.execute('confirm-funding',orderId,'fund-'+txHash,{txHash},async()=>{
   const row=await this.owned(orderId);
   const update=await this.query("UPDATE work_orders SET status='FUNDED' WHERE id=$1 AND status='APPROVED'",[row.id]);
   invariant(update.rowCount===1,'Order is already funded or unavailable');
   await this.query("INSERT INTO execution_events(event_key,work_order_id,event_type,payload) VALUES($1,$2,'funding.confirmed',$3)",['testnet:funding:'+txHash,row.id,canonicalJson(proof)]);
   return proof;
  });
 }
 async assertTeeReady(orderId:string,taskId:string,revision:number){
  const {config,state}=await this.load(orderId);if(config.verificationMode!==TEE_PROFILE)return;
  const row=await this.owned(orderId);invariant(row.status==='FUNDED','Confirmed TEE funding required');
  const view=await readFinalTeeOrder(config.agreement),dependencies:Record<string,string>={};
  for(const t of config.agreement.tasks.find(t=>t.id===taskId)?.dependsOn??[]){
   const local=(state as {tasks:Record<string,{artifactHash:string}>}).tasks[t];invariant(local,'Local dependency unavailable');dependencies[t]=local.artifactHash;
  }
  assertTeeTaskReady(config.agreement,view.order,view.teeState,taskId,revision,dependencies,view.blockTimeNs);
 }
 async teeSettlementPlan(orderId:string){
  const detail=await this.details(orderId);invariant(detail.config.verificationMode===TEE_PROFILE,'TEE mode required');
  invariant(['FUNDED','SUCCESS_CREDITED','FAILED','EXPIRED','REFUNDED'].includes(String(detail.financialStatus)),'Confirmed TEE funding required');
  const view=await readFinalTeeOrder(detail.config.agreement),artifacts=new Map<string,string>();
  for(const {report} of detail.reports)artifacts.set(report.taskId+':'+report.artifactVersion,(await this.artifact(orderId,report.taskId,report.artifactVersion)).bytes);
  return {...planTeeTask(detail.config,view.order,view.teeState,detail.reports,artifacts,view.blockTimeNs),blockHash:view.blockHash,verificationMode:TEE_PROFILE,
   chainTasks:[...view.tasks].map(([id,task])=>({id,result:task.result})),chainStatus:view.order.status,refunded:view.order.refunded};
 }
 async checkSettlement(orderId:string){
  const detail=await this.details(orderId);
  const agreement=detail.config.agreement;
  if(detail.config.verificationMode){
   const result=await this.teeSettlementPlan(orderId);
   if(result.state==='credited'&&detail.financialStatus==='FUNDED')await this.execute('confirm-credit',orderId,'credit-final',{},async()=>{
    const row=await this.owned(orderId);const updated=await this.query("UPDATE work_orders SET status='SUCCESS_CREDITED' WHERE id=$1 AND status='FUNDED'",[row.id]);
    invariant(updated.rowCount===1,'Order changed before settlement reconciliation');
    await this.event(orderId,'credit-final','settlement.credited',{blockHash:result.blockHash,amountAtomic:agreement.totalAmountAtomic,verificationMode:TEE_PROFILE});return {blockHash:result.blockHash};
   });
   return result;
  }
  invariant(agreement.contractId===this.contractId&&this.settlementAccount===agreement.verifierAccountId,'Create an order with a configured Testnet verifier');
  invariant(['FUNDED','SUCCESS_CREDITED'].includes(String(detail.financialStatus)),'Confirmed funding required');
  const view=await readFinalEscrowOrder(agreement);
  const result=nextSettlementIntent(agreement,view.order,detail.reports,view.blockTimeNs);
  if(result.state==='record'&&result.intent&&'task_id' in result.intent.args){
   const artifacts=new Map<string,string>();
   for(const envelope of detail.reports.filter(entry=>entry.report.decision==='accepted')){
    const report=envelope.report;
    await this.report(orderId,envelope.reportHash);
    artifacts.set(report.taskId+':'+report.artifactVersion,(await this.artifact(orderId,report.taskId,report.artifactVersion)).bytes);
   }
   recheckSettlementEvidence(detail.config,detail.reports,artifacts,String(result.intent.args.task_id));
  }
  if(result.state==='credited'&&detail.financialStatus==='FUNDED'){
   await this.execute('confirm-credit',orderId,'credit-final',{},async()=>{
    const row=await this.owned(orderId);
    const updated=await this.query("UPDATE work_orders SET status='SUCCESS_CREDITED' WHERE id=$1 AND status='FUNDED'",[row.id]);
    invariant(updated.rowCount===1,'Order changed before settlement reconciliation');
    await this.event(orderId,'credit-final','settlement.credited',{blockHash:view.blockHash,amountAtomic:agreement.totalAmountAtomic});
    return {blockHash:view.blockHash};
   });
  }
  return result;
 }
 async checkRefund(orderId:string){
  const {config}=await this.load(orderId);
  const row=await this.owned(orderId);
  invariant(config.agreement.contractId===this.contractId,'Wrong escrow deployment');
  invariant(['FUNDED','EXPIRED','FAILED','REFUNDED'].includes(String(row.status)),'Confirmed funding required');
  const proof=await readFinalRefund(config.agreement);
  if(proof.state==='refunded'&&row.status!=='REFUNDED'){
   await this.execute('confirm-refund',orderId,'refund-final',{},async()=>{
    const update=await this.query("UPDATE work_orders SET status='REFUNDED' WHERE id=$1 AND status IN ('FUNDED','EXPIRED','FAILED')",[row.id]);
    invariant(update.rowCount===1,'Order changed before refund reconciliation');
    await this.event(orderId,'refund-final','refund.confirmed',proof);
    return proof;
   });
  }
  const methodName=proof.state==='expire'?'mark_expired':proof.state==='claim'?'claim_refund':null;
  return {...proof,intent:methodName?{receiverId:this.contractId,signerId:this.actor,methodName,depositAtomic:'0',args:{order_id:orderId}}:null};
 }
 async orderKey(lease:JobLease){return this.withLease(lease,async()=>{const row=(await this.query('SELECT order_key FROM work_orders WHERE id=$1',[lease.orderId])).rows[0];invariant(row,'order not found');return String(row.order_key);});}
}
