import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalJson, hash, hashBytes } from '../../agreements/src/agreement.ts';
import { invariant } from '../../shared/src/domain.ts';
import { verifyReportIntegrity } from '../../verification/src/report.ts';
import type { ReportEnvelope } from '../../verification/src/report.ts';

// Development adapter only. The production PostgreSQL schema/adapter remains separate.
export class LocalStore {
 private db: DatabaseSync;
 private leaseGuard: (() => void) | undefined;
 private beforeCommit: (() => void) | undefined;
 constructor(filename: string, beforeCommit?: () => void) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), {recursive:true});
  this.beforeCommit=beforeCommit;
  this.db=new DatabaseSync(filename,{timeout:1000});
  this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
   CREATE TABLE IF NOT EXISTS local_jobs(order_id TEXT PRIMARY KEY REFERENCES local_orders(id),status TEXT NOT NULL,token INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,error TEXT);
   CREATE TABLE IF NOT EXISTS local_orders(id TEXT PRIMARY KEY,config_json TEXT NOT NULL,config_hash TEXT NOT NULL,state_json TEXT NOT NULL,version INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS local_artifacts(order_id TEXT NOT NULL REFERENCES local_orders(id),task_id TEXT NOT NULL,version INTEGER NOT NULL,artifact_hash TEXT NOT NULL,bytes TEXT NOT NULL,PRIMARY KEY(order_id,task_id,version));
   CREATE TABLE IF NOT EXISTS local_reports(report_hash TEXT PRIMARY KEY,order_id TEXT NOT NULL,task_id TEXT NOT NULL,version INTEGER NOT NULL,envelope_json TEXT NOT NULL,FOREIGN KEY(order_id,task_id,version) REFERENCES local_artifacts(order_id,task_id,version));
   CREATE TABLE IF NOT EXISTS local_events(seq INTEGER PRIMARY KEY,event_key TEXT UNIQUE NOT NULL,order_id TEXT NOT NULL REFERENCES local_orders(id),event_type TEXT NOT NULL,payload_json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS local_requests(order_id TEXT NOT NULL,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(order_id,request_id));
   CREATE TABLE IF NOT EXISTS local_transactions(seq INTEGER PRIMARY KEY,tx_id TEXT NOT NULL UNIQUE,order_id TEXT NOT NULL,operation TEXT NOT NULL,outcome TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL);
   CREATE TRIGGER IF NOT EXISTS freeze_order_config BEFORE UPDATE OF config_json,config_hash ON local_orders BEGIN SELECT RAISE(ABORT,'immutable order configuration'); END;
  `);
  const columns=this.db.prepare('PRAGMA table_info(local_jobs)').all();
  if(!columns.some(c=>c.name==='runner'))this.db.exec("ALTER TABLE local_jobs ADD COLUMN runner TEXT NOT NULL DEFAULT 'fixture'");
  this.db.exec("CREATE TABLE IF NOT EXISTS local_model_calls(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES local_orders(id),task_id TEXT NOT NULL,artifact_version INTEGER NOT NULL,attempt INTEGER NOT NULL,request_hash TEXT NOT NULL,request_json TEXT NOT NULL,status TEXT NOT NULL,output TEXT,error TEXT,UNIQUE(order_id,task_id,artifact_version,attempt));");
  this.db.exec("CREATE TRIGGER IF NOT EXISTS freeze_model_request BEFORE UPDATE OF id,order_id,task_id,artifact_version,attempt,request_hash,request_json ON local_model_calls BEGIN SELECT RAISE(ABORT,'immutable model request'); END;");
  this.db.exec("CREATE TRIGGER IF NOT EXISTS freeze_model_result BEFORE UPDATE ON local_model_calls WHEN OLD.status!='PENDING' BEGIN SELECT RAISE(ABORT,'immutable model result'); END;");
  this.db.exec("CREATE TRIGGER IF NOT EXISTS keep_model_calls BEFORE DELETE ON local_model_calls BEGIN SELECT RAISE(ABORT,'immutable model call'); END;");
  for(const table of ['local_artifacts','local_reports','local_events','local_requests','local_transactions']) {
   this.db.exec('CREATE TRIGGER IF NOT EXISTS '+table+'_no_update BEFORE UPDATE ON '+table+` BEGIN SELECT RAISE(ABORT,'immutable local record'); END;`);
   this.db.exec('CREATE TRIGGER IF NOT EXISTS '+table+'_no_delete BEFORE DELETE ON '+table+` BEGIN SELECT RAISE(ABORT,'immutable local record'); END;`);
  }
 }

 enqueue(orderId:string,runner:'fixture'|'model'='fixture') {
  this.load(orderId);
  invariant(runner==='fixture'||runner==='model','invalid runner');
  const existing=this.job(orderId);invariant(!existing||existing.runner===runner,'runner cannot be changed');
  this.db.prepare("INSERT INTO local_jobs(order_id,status,runner) VALUES(?,'QUEUED',?) ON CONFLICT(order_id) DO NOTHING").run(orderId,runner);
  this.db.prepare("UPDATE local_jobs SET status='QUEUED',error=NULL WHERE order_id=? AND status='FAILED'").run(orderId);
  return this.job(orderId);
 }
 job(orderId:string) {return this.db.prepare('SELECT * FROM local_jobs WHERE order_id=?').get(orderId);}
 claim(now:number,leaseMs=30000,runner:'fixture'|'model'='fixture',orderId?:string) {
  invariant(Number.isSafeInteger(now)&&Number.isSafeInteger(leaseMs)&&leaseMs>0,'invalid lease');
  // One SQL statement makes competing claims mutually exclusive across connections.
  return this.db.prepare("UPDATE local_jobs SET status='RUNNING',token=token+1,attempts=attempts+1,lease_until=? WHERE order_id=(SELECT order_id FROM local_jobs WHERE runner=? AND (? IS NULL OR order_id=?) AND (status='QUEUED' OR (status='RUNNING' AND lease_until<=?)) ORDER BY rowid LIMIT 1) RETURNING *").get(now+leaseMs,runner,orderId??null,orderId??null,now);
 }
 withLease<T>(orderId:string,token:number,now:()=>number,fn:()=>T):T {
  invariant(!this.leaseGuard,'nested lease guard');
  this.leaseGuard=()=>{const j=this.job(orderId);invariant(j?.status==='RUNNING'&&j.token===token&&Number(j.lease_until)>now(),'stale worker lease');};
  try {this.leaseGuard();return fn();}finally{this.leaseGuard=undefined;}
 }
 finishJob(orderId:string,token:number,now:number,status:'DONE'|'FAILED',error:string|null=null) {
  const result=this.db.prepare("UPDATE local_jobs SET status=?,error=?,lease_until=0 WHERE order_id=? AND token=? AND status='RUNNING' AND lease_until>?").run(status,error,orderId,token,now);
  invariant(result.changes===1,'stale worker lease');
 }

 renewLease(orderId:string,token:number,now:number,leaseMs=30000) {
  const result=this.db.prepare("UPDATE local_jobs SET lease_until=? WHERE order_id=? AND token=? AND status='RUNNING' AND lease_until>?").run(now+leaseMs,orderId,token,now);
  invariant(result.changes===1,'stale worker lease');
 }
 modelCalls(orderId:string,taskId?:string,version?:number) {
  return taskId===undefined?this.db.prepare('SELECT * FROM local_model_calls WHERE order_id=? ORDER BY rowid').all(orderId):
   this.db.prepare('SELECT * FROM local_model_calls WHERE order_id=? AND task_id=? AND artifact_version=? ORDER BY attempt').all(orderId,taskId,version!);
 }
 reserveModelCall(orderId:string,taskId:string,version:number,request:unknown,maxAttempts:number) {
  invariant(this.leaseGuard,'model call requires worker lease');
  // execute() supplies an enclosing IMMEDIATE transaction and validates the fencing token.
  const calls=this.modelCalls(orderId,taskId,version);invariant(calls.length<maxAttempts,'model attempt budget exhausted');
  const id=randomUUID(),attempt=calls.length+1;
  this.db.prepare("INSERT INTO local_model_calls VALUES(?,?,?,?,?,?,?,'PENDING',NULL,NULL)").run(id,orderId,taskId,version,attempt,hash(request),canonicalJson(request));
  return {id,attempt};
 }
 completeModelCall(id:string,output:string|null,error:string|null) {
  invariant(this.leaseGuard,'model result requires worker lease');
  const changed=this.db.prepare("UPDATE local_model_calls SET status=?,output=?,error=? WHERE id=? AND status='PENDING'").run(error===null?'SUCCEEDED':'FAILED',output,error,id);
  invariant(changed.changes===1,'model call is already terminal');
 }
 close() { this.db.close(); }
 private journal(txId: string, orderId: string, operation: string, outcome: string, detail: string) {
  this.db.prepare('INSERT INTO local_transactions(tx_id,order_id,operation,outcome,detail,created_at) VALUES(?,?,?,?,?,?)').run(txId,orderId,operation,outcome,detail,new Date().toISOString());
 }
 execute<T>(operation: string, orderId: string, requestId: string, payload: unknown, fn: () => T): {value:T;replayed:boolean;transactionId:string} {
  const fingerprint=hash({operation,payload});const transactionId=randomUUID();
  this.db.exec('BEGIN IMMEDIATE');
  try {
   this.leaseGuard?.();
   const cached=this.db.prepare('SELECT fingerprint,result_json FROM local_requests WHERE order_id=? AND request_id=?').get(orderId,requestId);
   if(cached) {
    invariant(cached.fingerprint===fingerprint,'idempotency key reused for different payload');
    this.journal(transactionId,orderId,operation,'REPLAYED','No workflow mutations');this.db.exec('COMMIT');
    return {value:JSON.parse(String(cached.result_json)) as T,replayed:true,transactionId};
   }
   const value=fn();
   this.db.prepare('INSERT INTO local_requests VALUES(?,?,?,?)').run(orderId,requestId,fingerprint,canonicalJson(value));
   this.beforeCommit?.();
   this.journal(transactionId,orderId,operation,'COMMITTED','State, artifacts, reports, events and idempotency result committed atomically');
   this.db.exec('COMMIT');return {value,replayed:false,transactionId};
  } catch(error) {
   this.db.exec('ROLLBACK');
   this.journal(transactionId,orderId,operation,'ROLLED_BACK',error instanceof Error?error.message:'operation failed');
   throw error;
  }
 }
 create(orderId: string, config: unknown, state: unknown) {
  this.db.prepare('INSERT INTO local_orders VALUES(?,?,?,?,?)').run(orderId,canonicalJson(config),hash(config),canonicalJson(state),1);
 }
 load(orderId: string): {config:unknown;state:unknown;version:number} {
  const row=this.db.prepare('SELECT * FROM local_orders WHERE id=?').get(orderId);invariant(row,'order not found');
  const config:unknown=JSON.parse(String(row.config_json));invariant(hash(config)===row.config_hash,'persisted config hash mismatch');
  return {config,state:JSON.parse(String(row.state_json)),version:Number(row.version)};
 }
 save(orderId: string, state: unknown, expectedVersion: number) {
  const result=this.db.prepare('UPDATE local_orders SET state_json=?,version=version+1 WHERE id=? AND version=?').run(canonicalJson(state),orderId,expectedVersion);
  invariant(result.changes===1,'stale order version');
 }
 event(orderId: string, key: string, type: string, payload: unknown) {
  this.db.prepare('INSERT INTO local_events(event_key,order_id,event_type,payload_json) VALUES(?,?,?,?)').run(orderId+':'+key,orderId,type,canonicalJson(payload));
 }
 submission(orderId: string, taskId: string, version: number, bytes: string, envelope: ReportEnvelope) {
  invariant(verifyReportIntegrity(envelope),'invalid report integrity');
  invariant(envelope.report.orderId===orderId && envelope.report.taskId===taskId && envelope.report.artifactVersion===version && envelope.report.artifactHash===hashBytes(bytes),'report artifact binding mismatch');
  this.db.prepare('INSERT INTO local_artifacts VALUES(?,?,?,?,?)').run(orderId,taskId,version,hashBytes(bytes),bytes);
  this.db.prepare('INSERT INTO local_reports VALUES(?,?,?,?,?)').run(envelope.reportHash,orderId,taskId,version,canonicalJson(envelope));
 }
 artifact(orderId: string, taskId: string, version: number): {bytes:string;hash:string} {
  const row=this.db.prepare('SELECT bytes,artifact_hash FROM local_artifacts WHERE order_id=? AND task_id=? AND version=?').get(orderId,taskId,version);invariant(row,'artifact not found');
  return {bytes:String(row.bytes),hash:String(row.artifact_hash)};
 }
 list() { return this.db.prepare('SELECT id,state_json,version FROM local_orders ORDER BY rowid DESC').all().map(r=>({id:String(r.id),state:JSON.parse(String(r.state_json)),version:Number(r.version)})); }
 details(orderId: string) {
  const snapshot=this.load(orderId);
  return {...snapshot,orderId,job:this.job(orderId)??null,modelCalls:this.modelCalls(orderId),reports:this.db.prepare('SELECT envelope_json FROM local_reports WHERE order_id=? ORDER BY rowid').all(orderId).map(r=>JSON.parse(String(r.envelope_json)) as ReportEnvelope),events:this.db.prepare('SELECT seq,event_type,payload_json FROM local_events WHERE order_id=? ORDER BY seq').all(orderId).map(r=>({seq:Number(r.seq),type:String(r.event_type),payload:JSON.parse(String(r.payload_json))})),transactions:this.db.prepare('SELECT * FROM local_transactions WHERE order_id=? ORDER BY seq').all(orderId)};
 }
 report(orderId:string,reportHash:string) {
  const row=this.db.prepare('SELECT envelope_json FROM local_reports WHERE order_id=? AND report_hash=?').get(orderId,reportHash);invariant(row,'report not found');return JSON.parse(String(row.envelope_json)) as ReportEnvelope;
 }
 counts(orderId:string) {
  const count=(table:string)=>Number(this.db.prepare('SELECT count(*) AS n FROM '+table+' WHERE order_id=?').get(orderId)!.n);
  return {artifacts:count('local_artifacts'),reports:count('local_reports'),events:count('local_events'),requests:count('local_requests')};
 }
}
