import {randomUUID} from 'node:crypto';
import {canonicalJson,hash,validateAgreement} from '../../agreements/src/agreement.ts';
import {identifier,invariant} from '../../shared/src/domain.ts';
import {validatePolicy,validateSources} from '../../verification/src/policy.ts';

export type SqlResult={rows:Record<string,unknown>[];rowCount:number|null};
export interface SqlClient{query(sql:string,values?:unknown[]):Promise<SqlResult>;release():void}
export interface SqlPool{connect():Promise<SqlClient>}
export type JobLease={id:string;orderId:string;token:string;attempt:number;payload:unknown};
// Trusted server repository, not a browser API or proof of authenticated wallet ownership.
// Inject a real pg Pool. No connection strings, keys or TLS overrides are embedded here.
export class PostgresStore{
 private pool:SqlPool;private schema:string;
 constructor(pool:SqlPool,schema:string){invariant(/^[a-z][a-z0-9_]{0,62}$/.test(schema),'invalid database schema');this.pool=pool;this.schema=schema;}
 private async client(){const c=await this.pool.connect();try{await c.query('SET search_path TO "'+this.schema+'", pg_catalog');await c.query("SET statement_timeout TO '15s'");await c.query("SET lock_timeout TO '5s'");return c;}catch(e){c.release();throw e;}}
 private async tx<T>(fn:(c:SqlClient)=>Promise<T>):Promise<T>{const c=await this.client();try{await c.query('BEGIN');const value=await fn(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async createApproved(input:unknown,policies:Record<string,unknown>,sources:unknown,actor:string,requestId:string,nowNs:bigint,beforeCommit?:()=>void,transactionClient?:SqlClient){
  identifier(requestId,'request');const agreement=validateAgreement(input,nowNs);invariant(actor===agreement.clientAccountId,'order owner mismatch');
  const corpus=validateSources(sources);invariant(hash(corpus)===agreement.sourceManifestHash,'source manifest mismatch');
  invariant(Object.keys(policies).length===agreement.tasks.length,'policy count mismatch');
  const approvedPolicies:Record<string,unknown>={};for(const task of agreement.tasks)approvedPolicies[task.id]=validatePolicy(policies[task.id],task);
  const snapshot={agreement,policies:approvedPolicies,sources:corpus},bytes=canonicalJson(snapshot),fingerprint=hash({operation:'createApproved',snapshot});
  const insert=async (c:SqlClient)=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor+':'+requestId]);
   const cached=(await c.query('SELECT fingerprint,result_json FROM command_results WHERE actor_account_id=$1 AND request_id=$2',[actor,requestId])).rows[0];
   if(cached){invariant(cached.fingerprint===fingerprint,'idempotency key reused for different payload');return {value:cached.result_json,replayed:true};}
   const id=randomUUID();
   await c.query("INSERT INTO work_orders(id,client_account_id,network,status,agreement_json,agreement_hash,total_amount_atomic,result_cutoff_ns,contract_id,order_key,snapshot_bytes,snapshot_hash) VALUES($1,$2,$3,'APPROVED',$4,$5,$6,$7,$8,$9,$10,$11)",[id,actor,agreement.network,canonicalJson(agreement),hash(agreement),agreement.totalAmountAtomic,agreement.resultCutoffNs,agreement.contractId,agreement.orderId,bytes,hash(snapshot)]);
   const ids:Record<string,string>={};
   for(const task of agreement.tasks){
    const policy=approvedPolicies[task.id];
    await c.query('INSERT INTO verification_policies(policy_hash,policy_json) VALUES($1,$2) ON CONFLICT DO NOTHING',[task.verificationPolicyHash,canonicalJson(policy)]);
    const existing=(await c.query('SELECT policy_json FROM verification_policies WHERE policy_hash=$1',[task.verificationPolicyHash])).rows[0];invariant(existing&&hash(existing.policy_json)===task.verificationPolicyHash,'stored policy hash mismatch');
    const taskId=randomUUID();ids[task.id]=taskId;
    await c.query("INSERT INTO subtasks(id,work_order_id,task_key,agent_id,runtime_version,recipient_account_id,allocated_amount_atomic,required,status,max_revisions,verification_policy_hash) VALUES($1,$2,$3,$4,$5,$6,$7,true,'PENDING',$8,$9)",[taskId,id,task.id,task.agentId,task.runtimeVersion,task.recipientAccountId,task.amountAtomic,task.maxRevisions,task.verificationPolicyHash]);
   }
   for(const task of agreement.tasks)for(const dep of task.dependsOn)await c.query('INSERT INTO task_dependencies VALUES($1,$2,$3)',[id,ids[dep],ids[task.id]]);
   const value={id,agreementHash:hash(agreement),version:1};
   await c.query('INSERT INTO execution_events(event_key,work_order_id,event_type,payload) VALUES($1,$2,$3,$4)',[id+':approved',id,'agreement.approved',canonicalJson(value)]);
   await c.query('INSERT INTO command_results(actor_account_id,request_id,work_order_id,fingerprint,result_json) VALUES($1,$2,$3,$4,$5)',[actor,requestId,id,fingerprint,canonicalJson(value)]);
   beforeCommit?.();return {value,replayed:false};
  };
  return transactionClient?insert(transactionClient):this.tx(insert);
 }
 async getOwned(id:string,actor:string){const c=await this.client();try{const row=(await c.query('SELECT * FROM work_orders WHERE id=$1 AND client_account_id=$2',[id,actor])).rows[0];invariant(row,'order not found or not owned');const snapshot:unknown=JSON.parse(String(row.snapshot_bytes));invariant(hash(snapshot)===row.snapshot_hash,'snapshot integrity mismatch');return {...row,snapshot};}finally{c.release();}}
 async enqueueReconciliation(orderId:string,key:string,payload:unknown,maxAttempts=3){
  identifier(key,'job key');invariant(Number.isInteger(maxAttempts)&&maxAttempts>=1&&maxAttempts<=10,'invalid attempt cap');
  const fingerprint=hash({kind:'reconcile_chain',payload,maxAttempts});
  return this.tx(async c=>{
   const scoped=orderId+':'+key;const id=randomUUID();
   await c.query("INSERT INTO jobs(id,work_order_id,job_type,idempotency_key,payload,status,max_attempts,fingerprint) VALUES($1,$2,'reconcile_chain',$3,$4,'queued',$5,$6) ON CONFLICT(idempotency_key) DO NOTHING",[id,orderId,scoped,canonicalJson(payload),maxAttempts,fingerprint]);
   const row=(await c.query('SELECT * FROM jobs WHERE idempotency_key=$1',[scoped])).rows[0]!;invariant(row.fingerprint===fingerprint,'job key payload conflict');return row;
  });
 }
 async enqueueExecution(orderId:string){
  return this.tx(async c=>{
   const row=(await c.query("SELECT o.id FROM work_orders o JOIN workflow_runs r ON r.work_order_id=o.id WHERE o.id=$1",[orderId])).rows[0];invariant(row,'execution run not found');
   await c.query("INSERT INTO jobs(id,work_order_id,job_type,idempotency_key,payload,status,max_attempts,fingerprint) VALUES($1,$2,'fixture_execution',$3,'{}','queued',3,$4) ON CONFLICT(idempotency_key) DO NOTHING",[randomUUID(),orderId,orderId+':fixture_execution',hash({kind:'fixture_execution'})]);
   return (await c.query("SELECT * FROM jobs WHERE idempotency_key=$1",[orderId+':fixture_execution'])).rows[0];
  });
 }
 async claimJob(leaseSeconds=30,jobType='reconcile_chain'):Promise<JobLease|null>{
  invariant(Number.isSafeInteger(leaseSeconds)&&leaseSeconds>=1&&leaseSeconds<=60,'invalid lease duration');
  return this.tx(async c=>{
   await c.query("UPDATE jobs SET status='failed',lease_token=NULL,lease_until=NULL,last_error='attempt budget exhausted' WHERE job_type=$1 AND attempts>=max_attempts AND (status='queued' OR (status='running' AND lease_until<=clock_timestamp()))",[jobType]);
   const token=randomUUID();const row=(await c.query("WITH candidate AS (SELECT id FROM jobs WHERE job_type=$3 AND available_at<=clock_timestamp() AND attempts<max_attempts AND (status='queued' OR (status='running' AND lease_until<=clock_timestamp())) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE jobs j SET status='running',attempts=j.attempts+1,lease_token=$1,lease_until=clock_timestamp()+($2::double precision*interval '1 second') FROM candidate WHERE j.id=candidate.id RETURNING j.*",[token,leaseSeconds,jobType])).rows[0];
   return row?{id:String(row.id),orderId:String(row.work_order_id),token,attempt:Number(row.attempts),payload:row.payload}:null;
  });
 }
 async withJobLease<T>(lease:JobLease,fn:(client:SqlClient)=>Promise<T>,complete=false,renewSeconds?:number):Promise<T>{
  invariant(renewSeconds===undefined||(Number.isInteger(renewSeconds)&&renewSeconds>=1&&renewSeconds<=60),'invalid lease renewal');
  return this.tx(async c=>{
   const row=(await c.query("SELECT id FROM jobs WHERE id=$1 AND work_order_id=$2 AND lease_token=$3 AND status='running' AND lease_until>clock_timestamp() FOR UPDATE",[lease.id,lease.orderId,lease.token])).rows[0];invariant(row,'stale job lease');
   const value=await fn(c);
   const checked=await c.query("UPDATE jobs SET status=CASE WHEN $4 THEN 'completed' ELSE status END,lease_token=CASE WHEN $4 THEN NULL ELSE lease_token END,lease_until=CASE WHEN $4 THEN NULL WHEN $5::int IS NOT NULL THEN clock_timestamp()+($5::int*interval '1 second') ELSE lease_until END WHERE id=$1 AND work_order_id=$2 AND lease_token=$3 AND lease_until>clock_timestamp()",[lease.id,lease.orderId,lease.token,complete,renewSeconds??null]);
   invariant(checked.rowCount===1,'lease expired before commit');return value;
  });
 }
}
