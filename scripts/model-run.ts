import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve,dirname } from 'node:path';
import { NearAiAdapter,settingsFromEnv } from '../packages/model/src/near-ai.ts';
import { LocalStore } from '../packages/database/src/local-store.ts';
import { LocalWorkflow } from '../packages/orchestration/src/local-workflow.ts';
import { ModelWorker } from '../packages/orchestration/src/model-worker.ts';
import { invariant } from '../packages/shared/src/domain.ts';

async function main(){
 const args=process.argv.slice(2),check=args[0]==='--check',run=args[0]==='--run';
 invariant(check||run,'Use --check (no request) or --run (billable model calls)');
 const resume=run&&args[1]==='--resume'?args[2]:undefined;
 invariant(check?args.length===1:args.length===1||(args.length===3&&resume!==undefined),'invalid arguments');
 const adapter=new NearAiAdapter(settingsFromEnv(process.env));
 if(check){console.log(JSON.stringify({provider:'near-ai',configured:true,...adapter.settings,networkCalls:0},null,2));return;}
 // Isolated from console.sqlite so the fixture UI cannot mislabel a model run.
 const filename=process.env.MODEL_DB_PATH??resolve(dirname(fileURLToPath(import.meta.url)),'../artifacts/local/model.sqlite');
 const store=new LocalStore(filename);
 try{
  const workflow=new LocalWorkflow(store);
  const id=resume??workflow.create(randomUUID(),'2500',3600).value.orderId;
  store.enqueue(id,'model');
  const worker=new ModelWorker(store,adapter);
  // Only this explicitly requested order may incur model calls.
 console.log(JSON.stringify({orderId:id,database:filename,provider:adapter.settings.provider,starting:true}));
  await worker.tick(id);
  const detail=store.details(id);
  console.log(JSON.stringify({orderId:id,database:filename,status:(detail.state as {status:string}).status,job:detail.job,modelCalls:detail.modelCalls.length,reports:detail.reports.map(r=>({hash:r.reportHash,task:r.report.taskId,decision:r.report.decision})),chain:false,attestationVerified:false},null,2));
  invariant(detail.job?.status==='DONE'&&(detail.state as {status:string}).status==='CHECKS_PASSED_LOCAL','model run did not pass; inspect local records before retrying');
 }finally{store.close();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'model run failed');process.exitCode=1;});
