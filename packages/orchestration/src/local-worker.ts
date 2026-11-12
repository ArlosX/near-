import { LocalStore } from '../../database/src/local-store.ts';
import { canonicalJson } from '../../agreements/src/agreement.ts';
import { LocalWorkflow } from './local-workflow.ts';
import type { DemoConfig } from './demo-data.ts';

type SnapshotState={status:string;tasks:Record<string,{status:string;revisions:number}>};
// Synthetic runner only. No AI, payment, chain acceptance or production authorization.
export class LocalWorker {
 private store:LocalStore;
 private now:()=>number;
 constructor(store:LocalStore,now:()=>number=Date.now){this.store=store;this.now=now;}
 tick(afterStep?:()=>void) {
  const job=this.store.claim(this.now());if(!job)return false;
  const orderId=String(job.order_id),token=Number(job.token);
  const workflow=new LocalWorkflow(this.store,()=>BigInt(this.now())*1000000n);
  try {
   for(let step=0;step<32;step++){
    const result=this.store.withLease(orderId,token,this.now,()=>{
     const snapshot=this.store.load(orderId),config=snapshot.config as DemoConfig,state=snapshot.state as SnapshotState;
     if(state.status!=='ACTIVE_LOCAL')return 'done';
     const key='worker-'+snapshot.version;
     if(BigInt(this.now())*1000000n>=BigInt(config.agreement.resultCutoffNs)){
      workflow.expire(orderId,snapshot.version,key);return 'continue';
     }
     const task=config.agreement.tasks.find(t=>{
      const local=state.tasks[t.id]!;
      return local.status==='IN_PROGRESS'||((local.status==='PENDING'||local.status==='REVISION_REQUIRED')&&t.dependsOn.every(id=>state.tasks[id]?.status==='CHECKS_PASSED_LOCAL'));
     });
     if(!task)throw new Error('No runnable task in active order');
     const local=state.tasks[task.id]!;
     if(local.status==='IN_PROGRESS')workflow.submit(orderId,task.id,canonicalJson(workflow.template(orderId,task.id)),snapshot.version,key);
     else workflow.start(orderId,task.id,snapshot.version,key);
     return 'continue';
    });
    // Fault injection models process death after committed work, before acknowledgement.
    afterStep?.();
    if(result==='done'){this.store.finishJob(orderId,token,this.now(),'DONE');return true;}
   }
   throw new Error('Worker step limit exceeded');
  }catch(error){
   // A stale worker cannot acknowledge or overwrite a newer worker's job.
   try{this.store.finishJob(orderId,token,this.now(),'FAILED',error instanceof Error?error.message:'worker failed');}catch{}
   throw error;
  }
 }
}
