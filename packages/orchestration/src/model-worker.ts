import { randomUUID } from 'node:crypto';
import {modelArtifactBytes} from '../../model/src/artifact.ts';
import { LocalStore } from '../../database/src/local-store.ts';
import { canonicalJson, hash } from '../../agreements/src/agreement.ts';
import { invariant } from '../../shared/src/domain.ts';
import { LocalWorkflow } from './local-workflow.ts';
import type { DemoConfig } from './demo-data.ts';
import type { ModelAdapter,Completion } from '../../model/src/near-ai.ts';
type State={status:string;tasks:Record<string,{status:string;revisions:number}>};

// Development model runner. Reports remain deterministic_only and never authorize settlement.
export class ModelWorker {
 private store:LocalStore;private adapter:ModelAdapter;private now:()=>number;
 constructor(store:LocalStore,adapter:ModelAdapter,now:()=>number=Date.now){this.store=store;this.adapter=adapter;this.now=now;}
 async tick(orderId?:string){
  const job=this.store.claim(this.now(),30000,'model',orderId);if(!job)return false;
  const id=String(job.order_id),token=Number(job.token),workflow=new LocalWorkflow(this.store,()=>BigInt(this.now())*1000000n);
  const fenced=<T>(fn:()=>T)=>this.store.withLease(id,token,this.now,fn);
  try{
   for(let step=0;step<32;step++){
    const loaded=this.store.load(id),config=loaded.config as DemoConfig,state=loaded.state as State;
    if(state.status!=='ACTIVE_LOCAL'){this.store.finishJob(id,token,this.now(),'DONE');return true;}
    if(BigInt(this.now())*1000000n>=BigInt(config.agreement.resultCutoffNs)){
     fenced(()=>workflow.expire(id,loaded.version,'model-expire-'+loaded.version));continue;
    }
    const task=config.agreement.tasks.find(t=>state.tasks[t.id]?.status==='IN_PROGRESS'||(['PENDING','REVISION_REQUIRED'].includes(state.tasks[t.id]!.status)&&t.dependsOn.every(dep=>state.tasks[dep]?.status==='CHECKS_PASSED_LOCAL')));
    invariant(task,'No runnable task');
    if(state.tasks[task.id]!.status!=='IN_PROGRESS'){
     fenced(()=>workflow.start(id,task.id,loaded.version,'model-start-'+loaded.version));continue;
    }
    const request=this.adapter.request(workflow.modelInput(id,task.id)),version=state.tasks[task.id]!.revisions+1;
    const calls=this.store.modelCalls(id,task.id,version);
    const cached=calls.find(c=>c.status==='SUCCEEDED');
    if(cached)invariant(cached.request_hash===hash(request),'model configuration or prompt changed for persisted response');
    let completion:Completion|undefined=cached?JSON.parse(String(cached.output)) as Completion:undefined;
    while(!completion){
     fenced(()=>this.store.renewLease(id,token,this.now()));
     const reserved=fenced(()=>this.store.execute('model.reserve',id,randomUUID(),{taskId:task.id,version,request},()=>this.store.reserveModelCall(id,task.id,version,request,this.adapter.settings.maxAttempts))).value;
     try{
      let leaseError:unknown;
      const heartbeat=setInterval(()=>{
       try{fenced(()=>this.store.renewLease(id,token,this.now()));}catch(error){leaseError=error;}
      },10000);
      heartbeat.unref();
      let response:Completion;
      try{response=await this.adapter.complete(request);if(leaseError)throw leaseError;}
      finally{clearInterval(heartbeat);}
      fenced(()=>this.store.execute('model.complete',id,reserved.id,{response},()=>{this.store.completeModelCall(reserved.id,canonicalJson(response),null);return {stored:true};}));
      completion=response;
     }catch(error){
      const message=error instanceof Error&&/^(model |invalid model )/.test(error.message)?error.message:'model call failed';
      fenced(()=>this.store.execute('model.fail',id,reserved.id,{message},()=>{this.store.completeModelCall(reserved.id,null,message);return {stored:true};}));
      if(this.store.modelCalls(id,task.id,version).length>=this.adapter.settings.maxAttempts)throw new Error('model attempt budget exhausted');
     }
    }
    if(BigInt(this.now())*1000000n>=BigInt(config.agreement.resultCutoffNs)){
     fenced(()=>workflow.expire(id,loaded.version,'model-expire-'+loaded.version));continue;
    }
    // Normalize JSON presentation; original model content remains in the immutable call record.
    // Invalid JSON goes to the verifier for bounded schema feedback.
     const bytes=modelArtifactBytes(completion.content);
    fenced(()=>workflow.submit(id,task.id,bytes,loaded.version,'model-submit-'+loaded.version));
   }
   throw new Error('model worker step limit exceeded');
  }catch(error){
   try{this.store.finishJob(id,token,this.now(),'FAILED',error instanceof Error?error.message:'model worker failed');}catch{}
   throw error;
  }
 }
}
