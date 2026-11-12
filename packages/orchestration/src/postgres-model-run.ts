import {hash,hashBytes} from '../../agreements/src/agreement.ts';
import {modelArtifactBytes} from '../../model/src/artifact.ts';
import type {PostgresExecutionStore} from '../../database/src/postgres-execution-store.ts';
import type {Completion,ModelAdapter} from '../../model/src/near-ai.ts';
import {invariant} from '../../shared/src/domain.ts';
import {PostgresWorkflow} from './postgres-workflow.ts';

type RunState={status:string;tasks:Record<string,{status:string;revisions:number}>};

// Explicitly targeted execution. Never called by the synthetic queue worker.
export async function runPostgresModel(store:PostgresExecutionStore,adapter:ModelAdapter,orderId:string,options:{retryUnansweredOnce?:boolean}={}){
 const flow=new PostgresWorkflow(store);
 for(let step=0;step<16;step++){
  const detail=await flow.details(orderId);
  invariant(detail.financialStatus==='FUNDED','A confirmed Testnet deposit is required');
  for(const {report} of detail.reports){
   const attempt='ai-'+report.taskId+'-'+report.artifactVersion;
   const entry=detail.events.find(event=>event.type==='model.response'&&(event.payload as {attempt:string}).attempt===attempt);
   const completion=(entry?.payload as {completion:Completion}|undefined)?.completion;
   invariant(completion&&hashBytes(modelArtifactBytes(completion.content))===report.artifactHash,'Order contains a report without a matching model response');
  }
  const state=detail.state as RunState;
  if(state.status!=='ACTIVE_LOCAL')return {status:state.status,reports:detail.reports};
  invariant(BigInt(detail.config.agreement.resultCutoffNs)>BigInt(Date.now())*1000000n,'Order deadline passed');
  const task=detail.config.agreement.tasks.find(candidate=>{
   const current=state.tasks[candidate.id];
   return current&&(current.status==='IN_PROGRESS'||(
    ['PENDING','REVISION_REQUIRED'].includes(current.status)&&candidate.dependsOn.every(id=>state.tasks[id]?.status==='CHECKS_PASSED_LOCAL')
   ));
  });
  invariant(task,'No runnable model task');
  const current=state.tasks[task.id]!;
  await store.assertTeeReady(orderId,task.id,current.revisions);
  if(current.status!=='IN_PROGRESS'){
   await flow.start(orderId,task.id,detail.version,'ai-start-'+detail.version);
   continue;
  }
  const input=await flow.modelInput(orderId,task.id);
  const request=adapter.request(input);
  const attempt='ai-'+task.id+'-'+input.version;
  const saved=detail.events.find(event=>event.type==='model.response'&&(event.payload as {attempt:string}).attempt===attempt);
  let completion:Completion;
  if(saved){
   completion=(saved.payload as {completion:Completion}).completion;
  }else{
   const reservation=await store.execute('reserve-model',orderId,attempt,{requestHash:hash(request)},async()=>{
    const latest=await store.load(orderId);
    invariant(latest.version===detail.version,'Order changed before model call');
    invariant(BigInt(latest.config.agreement.resultCutoffNs)>BigInt(Date.now())*1000000n,'Order deadline passed');
    await store.event(orderId,attempt,'model.reserved',{attempt,model:adapter.settings.model,requestHash:hash(request)});
    return {attempt};
   });
   if(reservation.replayed){
    invariant(options.retryUnansweredOnce,'A model call was already reserved. Inspect the order before retrying.');
    // Explicit recovery only: retain the original reservation, record the
    // ambiguity, and durably allow at most one additional provider request.
    const retry=await store.execute('retry-unanswered-model',orderId,attempt+'-retry-1',{requestHash:hash(request)},async()=>{
     const latest=await store.load(orderId);
     invariant(latest.version===detail.version&&BigInt(latest.config.agreement.resultCutoffNs)>BigInt(Date.now())*1000000n,'Order changed or expired before recovery');
     await store.event(orderId,attempt+'-retry-1','model.retry.reserved',{attempt,requestHash:hash(request),reason:'explicit recovery after unanswered request; original provider completion is unknown'});
     return {attempt};
    });
    invariant(!retry.replayed,'The one permitted unanswered-request recovery was already used');
   }
   completion=await adapter.complete(request);
   await store.execute('record-model',orderId,attempt+'-response',{responseHash:hash(completion)},async()=>{
    await store.event(orderId,attempt+'-response','model.response',{attempt,completion});
    return {attempt};
   });
  }
  await flow.submit(orderId,task.id,modelArtifactBytes(completion.content),detail.version,attempt+'-submit');
  if(detail.config.verificationMode)return {status:'AWAITING_TEE',reports:(await flow.details(orderId)).reports};
 }
 throw new Error('Model workflow step limit reached');
}
