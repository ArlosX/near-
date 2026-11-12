import {validateExecutionLifetime} from '../../shared/src/execution-deadline.ts';
import { randomUUID } from 'node:crypto';
import { canonicalJson, hash, hashBytes } from '../../agreements/src/agreement.ts';
import { atomic, identifier, invariant } from '../../shared/src/domain.ts';
import { transition } from './workflow.ts';
import type { TaskRun } from './workflow.ts';
import { PostgresExecutionStore } from '../../database/src/postgres-execution-store.ts';
import { verifySubmission } from '../../verification/src/report.ts';
import type { AcceptedDependency } from '../../verification/src/report.ts';
import { eligible, verifySupplier } from '../../verification/src/verify.ts';
import { artifactTemplate, createDemoConfig } from './demo-data.ts';
import type { DemoConfig } from './demo-data.ts';
import type { Artifact } from '../../verification/src/policy.ts';

type LocalTask = Omit<TaskRun,'status'> & {status:TaskRun['status']|'CHECKS_PASSED_LOCAL'|'BLOCKED_LOCAL';artifactVersion:number|null};
type State = {scope:'local_test';status:'ACTIVE_LOCAL'|'CHECKS_PASSED_LOCAL'|'FAILED_LOCAL'|'EXPIRED_LOCAL';tasks:Record<string,LocalTask>};
// PostgreSQL loopback fixture harness only: dependency acceptance here is NOT chain acceptance.
// Do not reuse this adapter as a production final-verdict authority.
export class PostgresWorkflow {
 store: PostgresExecutionStore;
 private now: () => bigint;
 constructor(store:PostgresExecutionStore, clock:()=>bigint=()=>BigInt(Date.now())*1000000n){this.store=store;this.now=clock;}
 private async snapshot(orderId:string){const loaded=await this.store.load(orderId);return {...loaded,config:loaded.config as DemoConfig,state:loaded.state as State};}
 private key(key:string){identifier(key,'request id');}
 private version(actual:number,expected:number){invariant(Number.isSafeInteger(expected)&&actual===expected,'stale order version');}
 private open(config:DemoConfig,state:State){invariant(state.status==='ACTIVE_LOCAL','terminal local order');invariant(this.now()<BigInt(config.agreement.resultCutoffNs),'result cutoff reached');}
 async create(requestId:string,budgetMinor='2500',lifetimeSeconds=3600){
  this.key(requestId);atomic(budgetMinor,'procurement budget');validateExecutionLifetime(lifetimeSeconds);
  const orderId=this.store.actor==='demo-client.testnet'?'demo-'+requestId:'demo-'+hash({actor:this.store.actor,requestId}).slice(7,55);
  return this.store.execute('create',orderId,requestId,{budgetMinor,lifetimeSeconds},async()=>{
   const config=createDemoConfig(orderId,this.now(),budgetMinor,lifetimeSeconds,this.store.actor,this.store.contractId,this.store.settlementAccount);
   if(this.store.verificationMode)config.verificationMode=this.store.verificationMode;
   const tasks:State['tasks']={};for(const task of config.agreement.tasks)tasks[task.id]={status:'PENDING',revisions:0,maxRevisions:task.maxRevisions,artifactHash:null,artifactVersion:null};
   await this.store.create(orderId,config,{scope:'local_test',status:'ACTIVE_LOCAL',tasks});await this.store.event(orderId,requestId+':created','order.created.local',{agreementHash:hash(config.agreement),scope:'local_test'});
   return {orderId,version:1};
  });
 }
 async start(orderId:string,taskId:string,expectedVersion:number,requestId:string){
  this.key(requestId);identifier(taskId,'task');
  return this.store.execute('start',orderId,requestId,{taskId,expectedVersion},async()=>{
   const {config,state,version}=await this.snapshot(orderId);this.version(version,expectedVersion);this.open(config,state);
   const task=config.agreement.tasks.find(t=>t.id===taskId);invariant(task,'unknown task');const local=state.tasks[taskId]!;
   invariant(local.status==='PENDING'||local.status==='REVISION_REQUIRED','cannot start this task');
   await this.store.assertTeeReady(orderId,taskId,local.revisions);
   const next=transition(local as TaskRun,{type:'start',dependenciesAccepted:task.dependsOn.every(id=>state.tasks[id]?.status==='CHECKS_PASSED_LOCAL')},this.now(),BigInt(config.agreement.resultCutoffNs));
   state.tasks[taskId]={...local,...next};await this.store.save(orderId,state,version);await this.store.event(orderId,requestId+':started','task.started.local',{taskId,revision:local.revisions});
   return {orderId,taskId,version:version+1};
  });
 }
 async template(orderId:string,taskId:string):Promise<Artifact> {
  const {config,state}=await this.snapshot(orderId);const task=config.agreement.tasks.find(t=>t.id===taskId);invariant(task,'unknown task');
  const deps=await this.dependencies(orderId,task.dependsOn,state,config);const inputs:Record<string,string>={};for(const d of deps)inputs[d.taskId]=d.artifactHash;
  const suppliers=deps.length? (JSON.parse(deps[0]!.artifactBytes) as Artifact).suppliers:config.suppliers;
  const selected=taskId==='compare'?suppliers.find(s=>eligible(verifySupplier(s,config.sources,config.policies[taskId]!.constraints)))?.id??null:null;
  return artifactTemplate(taskId,state.tasks[taskId]!.revisions+1,suppliers,inputs,selected);
 }
 async modelInput(orderId:string,taskId:string) {
  const {config,state}=await this.snapshot(orderId);const task=config.agreement.tasks.find(t=>t.id===taskId);invariant(task,'unknown task');
  const local=state.tasks[taskId]!;invariant(local.status==='IN_PROGRESS','task must be started');
  const feedback=(await this.store.details(orderId)).reports.filter(r=>r.report.taskId===taskId).map(r=>r.report);
  return {taskId,version:local.revisions+1,policy:config.policies[taskId]!,sources:config.sources,dependencies:await this.dependencies(orderId,task.dependsOn,state,config),feedback};
 }
 private async dependencies(orderId:string,ids:string[],state:State,config:DemoConfig):Promise<AcceptedDependency[]>{
  return Promise.all(ids.map(async id=>{
   const prior=state.tasks[id];invariant(prior?.status==='CHECKS_PASSED_LOCAL'&&prior.artifactVersion!==null,'dependencies not locally accepted');
   const artifact=await this.store.artifact(orderId,id,prior.artifactVersion);invariant(artifact.hash===prior.artifactHash,'accepted artifact hash mismatch');
   return {orderId,taskId:id,agreementHash:hash(config.agreement),artifactHash:artifact.hash,artifactBytes:artifact.bytes};
  }));
 }
 async submit(orderId:string,taskId:string,artifactBytes:string,expectedVersion:number,requestId:string){
  this.key(requestId);identifier(taskId,'task');invariant(typeof artifactBytes==='string'&&Buffer.byteLength(artifactBytes,'utf8')<=1000000,'artifact too large');
  return this.store.execute('submit',orderId,requestId,{taskId,artifactBytes,expectedVersion},async()=>{
   const {config,state,version}=await this.snapshot(orderId);this.version(version,expectedVersion);this.open(config,state);
   const task=config.agreement.tasks.find(t=>t.id===taskId);invariant(task,'unknown task');const local=state.tasks[taskId]!;invariant(local.status==='IN_PROGRESS','task must be started before submission');
   await this.store.assertTeeReady(orderId,taskId,local.revisions);
   const now=this.now();const pending=transition(local as TaskRun,{type:'submit',artifactHash:hashBytes(artifactBytes)},now,BigInt(config.agreement.resultCutoffNs));
   const envelope=verifySubmission({agreement:config.agreement,approvedAgreementHash:hash(config.agreement),taskId,policy:config.policies[taskId],sources:config.sources,artifactBytes,revision:local.revisions,evaluatedAtNs:now.toString(),acceptedDependencies:await this.dependencies(orderId,task.dependsOn,state,config)});
   const decision=envelope.report.decision;
   const next=transition(pending,decision==='accepted'?{type:'accept',artifactHash:envelope.report.artifactHash}:decision==='revision_required'?{type:'revise'}:{type:'reject'},now,BigInt(config.agreement.resultCutoffNs));
   state.tasks[taskId]={...local,...next,status:decision==='accepted'?'CHECKS_PASSED_LOCAL':next.status,artifactVersion:envelope.report.artifactVersion};
   const all=Object.values(state.tasks);state.status=all.some(t=>t.status==='REJECTED')?'FAILED_LOCAL':all.every(t=>t.status==='CHECKS_PASSED_LOCAL')?'CHECKS_PASSED_LOCAL':'ACTIVE_LOCAL';
   if(state.status==='FAILED_LOCAL')for(const [id,pendingTask]of Object.entries(state.tasks)){if(pendingTask.status!=='CHECKS_PASSED_LOCAL'&&pendingTask.status!=='REJECTED'){pendingTask.status='BLOCKED_LOCAL';await this.store.event(orderId,requestId+':blocked:'+id,'task.blocked.local',{taskId:id,reason:'parent_failed'});}}
   await this.store.submission(orderId,taskId,envelope.report.artifactVersion,artifactBytes,envelope);
   await this.store.event(orderId,requestId+':submitted','artifact.submitted.local',{taskId,artifactHash:envelope.report.artifactHash,version:envelope.report.artifactVersion});
   await this.store.event(orderId,requestId+':verified','verification.completed.local',{taskId,decision,reportHash:envelope.reportHash,scope:'deterministic_only'});
   await this.store.save(orderId,state,version);
   return {orderId,taskId,decision,reportHash:envelope.reportHash,version:version+1};
  });
 }
 async expire(orderId:string,expectedVersion:number,requestId:string){
  this.key(requestId);return this.store.execute('expire',orderId,requestId,{expectedVersion},async()=>{
   const {config,state,version}=await this.snapshot(orderId);this.version(version,expectedVersion);invariant(state.status==='ACTIVE_LOCAL','terminal local order');invariant(this.now()>=BigInt(config.agreement.resultCutoffNs),'not expired');state.status='EXPIRED_LOCAL';for(const pendingTask of Object.values(state.tasks))if(pendingTask.status!=='CHECKS_PASSED_LOCAL'&&pendingTask.status!=='REJECTED')pendingTask.status='BLOCKED_LOCAL';await this.store.save(orderId,state,version);await this.store.event(orderId,requestId+':expired','order.expired.local',{});return {orderId,version:version+1};
  });
 }
 async rollbackProbe(orderId:string,expectedVersion:number){
  const before=await this.store.counts(orderId);const initial=await this.snapshot(orderId);
  try{await this.store.execute('rollback_probe',orderId,randomUUID(),{},async()=>{
   this.version(initial.version,expectedVersion);await this.store.event(orderId,randomUUID(),'probe.must_not_persist',{});await this.store.save(orderId,initial.state,initial.version);throw new Error('INTENTIONAL_ROLLBACK_PROBE');
  });}catch(error){invariant(error instanceof Error&&error.message==='INTENTIONAL_ROLLBACK_PROBE','rollback probe could not execute');}
  const after=await this.store.counts(orderId);const rolledBack=canonicalJson(before)===canonicalJson(after)&&(await this.snapshot(orderId)).version===initial.version;invariant(rolledBack,'rollback verification failed');return {rolledBack,before,after,version:initial.version,scope:'postgres_transaction_only'};
 }
 async details(orderId:string){return this.store.details(orderId);}
}
