import { PostgresExecutionStore } from '../../database/src/postgres-execution-store.ts';
import { canonicalJson } from '../../agreements/src/agreement.ts';
import { PostgresWorkflow } from './postgres-workflow.ts';
import type { DemoConfig } from './demo-data.ts';

type SnapshotState={status:string;tasks:Record<string,{status:string;revisions:number}>};
// Synthetic runner only. No AI, payment, chain acceptance or production authorization.
export class PostgresWorker {
 private store:PostgresExecutionStore;
 private now:()=>number;
 constructor(store:PostgresExecutionStore,now:()=>number=Date.now){this.store=store;this.now=now;}
 async tick(afterStep?:()=>void) {
  const job=await this.store.claim();if(!job)return false;
  const store=this.store.forActor(await this.store.jobOwner(job));
  const orderId=await store.orderKey(job);
  const workflow=new PostgresWorkflow(store,()=>BigInt(this.now())*1000000n);
  try {
   for(let step=0;step<32;step++){
    const result=await store.withLease(job,async()=>{
     const snapshot=await store.load(orderId),config=snapshot.config as DemoConfig,state=snapshot.state as SnapshotState;
     if(state.status!=='ACTIVE_LOCAL')return 'done';
     const key='worker-'+snapshot.version;
     if(BigInt(this.now())*1000000n>=BigInt(config.agreement.resultCutoffNs)){
      await workflow.expire(orderId,snapshot.version,key);return 'continue';
     }
     const task=config.agreement.tasks.find(t=>{
      const local=state.tasks[t.id]!;
      return local.status==='IN_PROGRESS'||((local.status==='PENDING'||local.status==='REVISION_REQUIRED')&&t.dependsOn.every(id=>state.tasks[id]?.status==='CHECKS_PASSED_LOCAL'));
     });
     if(!task)throw new Error('No runnable task in active order');
     const local=state.tasks[task.id]!;
     if(local.status==='IN_PROGRESS')await workflow.submit(orderId,task.id,canonicalJson(await workflow.template(orderId,task.id)),snapshot.version,key);
     else await workflow.start(orderId,task.id,snapshot.version,key);
     return 'continue';
    });
    // Fault injection models process death after committed work, before acknowledgement.
    afterStep?.();
    if(result==='done'){await store.withLease(job,async()=>true,true);return true;}
   }
   throw new Error('Worker step limit exceeded');
  }catch(error){
   // A stale worker cannot acknowledge or overwrite a newer worker's job.
   // Keep the bounded job recoverable after lease expiry; committed steps are retained.
   throw error;
  }
 }
}
