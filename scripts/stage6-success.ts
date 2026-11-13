import {operatorRun} from '../packages/shared/src/operator-run.ts';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createDatabasePool} from '../packages/database/src/connection.ts';
import {createEvidenceStorage} from '../packages/database/src/evidence-storage.ts';
import {PostgresExecutionStore} from '../packages/database/src/postgres-execution-store.ts';
import {PostgresWorkflow} from '../packages/orchestration/src/postgres-workflow.ts';
import {runPostgresModel} from '../packages/orchestration/src/postgres-model-run.ts';
import {NearAiAdapter} from '../packages/model/src/near-ai.ts';
import {TEE_LIMITS,teeExecutionIntent} from '../packages/agreements/src/tee-execution.ts';
import {canonicalJson,hash} from '../packages/agreements/src/agreement.ts';
import {invariant,record,identifier} from '../packages/shared/src/domain.ts';
import {readJsonResponse,parseJsonStrict} from '../packages/shared/src/json.ts';
import {LocalStore} from '../packages/database/src/local-store.ts';
import {validateRecordedReplay} from '../packages/model/src/recorded-replay.ts';
import type {DemoConfig} from '../packages/orchestration/src/demo-data.ts';

// Explicit owner-reviewed stage-6 route. It never reads keys from a wallet,
// signs, sends a transaction, or changes historical orders/global model settings.
const run=operatorRun(),CONTRACT=run.contract,ACTOR=run.actor,PROFILE=run.profile;
const CODE_HASH=run.codeHash;
const folder=operatorRun().folder,checkpoint=resolve(folder,'checkpoint.json');
async function rpc(method:string,params:unknown){
 const response=await fetch('https://rpc.testnet.fastnear.com',{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000),body:JSON.stringify({jsonrpc:'2.0',id:'stage6',method,params})});
 invariant(response.ok,'Stage 6 Testnet RPC unavailable');
 const payload=record(await readJsonResponse(response,262144),'Stage 6 RPC');invariant(!payload.error&&payload.id==='stage6','Stage 6 chain query failed');return payload.result;
}
async function writeIntent(intent:unknown){
 const file=resolve(folder,'next-intent.json');
 await writeFile(file,canonicalJson(intent)+'\n');
 const argsFile=resolve(folder,'next-args.json'),value=record(intent,'intent');
 await writeFile(argsFile,canonicalJson(value.args)+'\n');
 console.log(JSON.stringify({status:'OWNER_SIGNATURE_REQUIRED',file,argsFile,signer:value.signerId,receiver:value.receiverId,method:value.methodName,depositAtomic:value.depositAtomic,gasTgas:value.gasTgas??80},null,2));
}
async function main(){
 const [action,txHash,...extra]=process.argv.slice(2);
 invariant(['--create','--funding','--confirm-funding','--model','--retry-model','--replay','--plan','--execute','--status'].includes(action??'')&&extra.length===0,'Use --create / --funding / --confirm-funding TX / --model / --retry-model / --replay / --plan / --execute / --status');
 invariant((action==='--confirm-funding')===Boolean(txHash),'Only --confirm-funding takes a transaction ID');
 // Before creating a time-limited agreement, fail early if credentials/model are missing.
 invariant(process.env.GEMINI_API_KEY?.trim()&&process.env.GEMINI_MODEL?.trim(),'Separate GEMINI_API_KEY and GEMINI_MODEL must be configured');
 const account=record(await rpc('query',{request_type:'view_account',account_id:CONTRACT,finality:'final'}),'contract account');
 invariant(account.code_hash===CODE_HASH,'Deployed escrow code hash differs from the stage-5 reviewed artifact');
 const pool=createDatabasePool();
 try{
  const archive=createEvidenceStorage();if(action==='--create')await archive.ensureBucket();
  // Command-local cache of hash-verified immutable evidence, not a persistent
  // trust shortcut. Avoid repeated source downloads during nested store reads.
  const verifiedBytes=new Map<string,string>();
  const storage={put:(scope:string,bytes:string)=>archive.put(scope,bytes),get:async(key:string,digest:string)=>{
   const cacheKey=key+':'+digest;
   if(!verifiedBytes.has(cacheKey))for(let attempt=0;attempt<3;attempt++){
    try{verifiedBytes.set(cacheKey,await archive.get(key,digest));break;}
    catch(e){if(!(e instanceof Error)||e.message!=='Private evidence unavailable'||attempt===2)throw e;await delay(500*(attempt+1));}
   }
   return verifiedBytes.get(cacheKey)!;
  }};
  const store=new PostgresExecutionStore(pool,'near_agent_work',storage,ACTOR,CONTRACT,ACTOR,PROFILE);
  await mkdir(folder,{recursive:true});
  let saved:{orderId:string;agreementHash:string};
  if(action==='--create'){
   let exists=false;try{await readFile(checkpoint);exists=true;}catch(e){invariant((e as NodeJS.ErrnoException).code==='ENOENT','Checkpoint unavailable');}
   invariant(!exists,'Stage 6 order already exists; use --funding or --status. Do not create another funded slot.');
   // Keep the creation request durable before database/archive work, so a
   // transient read failure cannot create another approved order on retry.
   const requestFile=resolve(folder,'creation-request.json');let requestId:string;
   try{const savedRequest=record(parseJsonStrict(await readFile(requestFile,'utf8')),'creation request');invariant(typeof savedRequest.requestId==='string','Invalid creation request');requestId=savedRequest.requestId;}
   catch(e){invariant((e as NodeJS.ErrnoException).code==='ENOENT','Creation request is unreadable');requestId=randomUUID();await writeFile(requestFile,canonicalJson({requestId})+'\n',{flag:'wx'});}
   identifier(requestId,'creation request');
   const created=await new PostgresWorkflow(store).create(requestId,'2500',21600);
   const {config}=await store.load(created.value.orderId);
   saved={orderId:created.value.orderId,agreementHash:hash(config.agreement)};
   await writeFile(checkpoint,canonicalJson(saved)+'\n',{flag:'wx'});
   await writeFile(resolve(folder,'agreement.json'),canonicalJson(config.agreement)+'\n',{flag:'wx'});
   await writeIntent(await store.getFundingIntent(saved.orderId));return;
  }
  saved=parseJsonStrict(await readFile(checkpoint,'utf8')) as typeof saved;identifier(saved.orderId,'stage6 order');
  const detail=await store.details(saved.orderId);
  invariant(detail.config.verificationMode===PROFILE&&detail.config.agreement.contractId===CONTRACT&&hash(detail.config.agreement)===saved.agreementHash,'Stage 6 checkpoint binding mismatch');
  if(action==='--funding'){await writeIntent(await store.getFundingIntent(saved.orderId));return;}
  if(action==='--confirm-funding'){console.log(JSON.stringify(await store.confirmFunding(saved.orderId,txHash!),null,2));return;}
  if(action==='--replay'){
   const plan=await store.teeSettlementPlan(saved.orderId);invariant(plan.state==='model'&&plan.taskId,'No replay-eligible task');
   const taskId=plan.taskId,flow=new PostgresWorkflow(store);
   const state=detail.state as {tasks:Record<string,{status:string}>};
   if(state.tasks[taskId]!.status!=='IN_PROGRESS')await flow.start(saved.orderId,taskId,detail.version,'replay-start-'+taskId);
   const input=await flow.modelInput(saved.orderId,taskId),source=new LocalStore(resolve('artifacts/local/model.sqlite'));
   try{
    const sourceId='demo-3610a04d-cc17-47ef-ba4c-a5e72dd5b168',original=source.details(sourceId),envelope=original.reports.find(e=>e.report.taskId===taskId&&e.report.decision==='accepted');
    invariant(envelope,'Recorded Gemini report unavailable');
    const artifact=source.artifact(sourceId,taskId,envelope.report.artifactVersion),call=source.modelCalls(sourceId,taskId,envelope.report.artifactVersion).find(c=>c.status==='SUCCEEDED');
    invariant(call&&typeof call.output==='string','Recorded provider completion unavailable');
    const dependencies:Record<string,string>={};for(const dep of input.dependencies)dependencies[dep.taskId]=dep.artifactHash;
    const replay=validateRecordedReplay(detail.config,original.config as DemoConfig,envelope,artifact.bytes,parseJsonStrict(call.output),input.version,dependencies);
    const latest=await store.load(saved.orderId),key='recorded-replay-'+taskId+'-'+input.version;
    const {bytes:recordedBytes,...provenance}=replay;
    await store.execute('record-replay',saved.orderId,key,{artifactHash:replay.sourceArtifactHash},async()=>{await store.event(saved.orderId,key,'model.replay.imported',{...provenance,originalCallId:call.id});return {execution:replay.execution};});
    const result=await flow.submit(saved.orderId,taskId,replay.bytes,latest.version,key+'-submit');
    console.log(JSON.stringify({execution:replay.execution,taskId,decision:result.value.decision,sourceOrderId:sourceId,networkModelCalls:0}));return;
   }finally{source.close();}
  }
  if(action==='--model'||action==='--retry-model'){
   const adapter=new NearAiAdapter({provider:'gemini',model:process.env.GEMINI_MODEL!,apiKey:process.env.GEMINI_API_KEY!,timeoutMs:20000,maxTokens:2048,maxAttempts:1});
   const result=await runPostgresModel(store,adapter,saved.orderId,{retryUnansweredOnce:action==='--retry-model'});
   console.log(JSON.stringify({status:result.status,reports:result.reports.map(e=>({taskId:e.report.taskId,decision:e.report.decision,artifactHash:e.report.artifactHash}))},null,2));return;
  }
  if(action==='--plan'||action==='--execute'){
   // Never leave an older unsigned transaction available after a failed/new check.
   await rm(resolve(folder,'next-intent.json'),{force:true});
   await rm(resolve(folder,'next-args.json'),{force:true});
   const plan=await store.teeSettlementPlan(saved.orderId);
   await writeFile(resolve(folder,'last-plan.json'),canonicalJson(plan)+'\n');
   if(action==='--execute'){
    invariant(plan.state!=='expire','Order deadline has passed. Do not pay OutLayer; mark this order expired and claim its refund.');
    invariant(plan.state==='execute'&&typeof plan.inputData==='string','An on-chain pending TEE request is required');
    const view=record(await rpc('query',{request_type:'call_function',account_id:'outlayer.testnet',method_name:'estimate_execution_cost',args_base64:Buffer.from(canonicalJson({resource_limits:TEE_LIMITS,input_len:Buffer.byteLength(plan.inputData)})).toString('base64'),finality:'final'}),'OutLayer cost view');
    invariant(Array.isArray(view.result)&&view.result.length<4096,'Invalid OutLayer estimate response');
    const estimate=parseJsonStrict(Buffer.from(view.result).toString('utf8'));
    const intent=teeExecutionIntent(plan.inputData,ACTOR,estimate);
    await writeFile(resolve(folder,plan.taskId+'-execution-review.json'),canonicalJson({intent,estimateBlock:view.block_hash,pendingBlock:plan.blockHash})+'\n');
    await writeIntent(intent);return;
   }
   if(plan.intent)await writeIntent(plan.intent);
   else console.log(JSON.stringify(plan,null,2));return;
  }
  console.log(JSON.stringify({orderId:saved.orderId,agreementHash:saved.agreementHash,verificationMode:detail.config.verificationMode,financialStatus:detail.financialStatus,localState:detail.state,reports:detail.reports.map(e=>({taskId:e.report.taskId,decision:e.report.decision}))},null,2));
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Stage 6 failed');process.exitCode=1;});
