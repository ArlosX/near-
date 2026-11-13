import {TEE_MEASUREMENTS} from '../packages/shared/src/tee-profiles.ts';
import {operatorRun} from '../packages/shared/src/operator-run.ts';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {canonicalJson,hash} from '../packages/agreements/src/agreement.ts';
import {teeExecutionArgs} from '../packages/agreements/src/tee-execution.ts';
import {teeVerificationSummary} from '../packages/agreements/src/tee-settlement.ts';
import {createDatabasePool} from '../packages/database/src/connection.ts';
import {createEvidenceStorage} from '../packages/database/src/evidence-storage.ts';
import {PostgresExecutionStore} from '../packages/database/src/postgres-execution-store.ts';
import {invariant,record} from '../packages/shared/src/domain.ts';
import {parseJsonStrict,readJsonResponse} from '../packages/shared/src/json.ts';
import {prepareTeeProof} from './prepare-tee-proof.mjs';
import {requireWorkerMeasurements} from './tee-measurement-preflight.mjs';

// Receipt and byte binding only. The escrow still independently verifies Intel
// signatures and its pending request. Stored verifier booleans grant no authority.
export function verifyExecutionReceipt(expected,txHash,outcome,bundle){
 invariant(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash),'Invalid execution transaction ID');
 const r=record(outcome,'execution receipt'),tx=record(r.transaction,'execution transaction');
 invariant(r.final_execution_status==='FINAL'&&typeof r.status?.SuccessValue==='string','OutLayer execution is not final and successful');
 invariant(tx.hash===txHash&&tx.signer_id===expected.signerId&&tx.receiver_id==='outlayer.testnet'&&Array.isArray(tx.actions)&&tx.actions.length===1,'OutLayer transaction identity mismatch');
 const call=record(tx.actions[0].FunctionCall,'OutLayer function call');
 invariant(call.method_name==='request_execution'&&call.deposit===expected.depositAtomic&&canonicalJson(parseJsonStrict(Buffer.from(call.args,'base64').toString('utf8')))===canonicalJson(expected.args),'OutLayer execution arguments mismatch');
 invariant(bundle.input_raw===expected.args.input_data&&bundle.attestation?.caller_account_id===expected.signerId,'OutLayer proof input or caller mismatch');
 invariant(Buffer.from(r.status.SuccessValue,'base64').toString('utf8')===bundle.output_raw,'OutLayer receipt output bytes mismatch');
 return true;
}

async function main(){
 const {folder,actor,contract,profile}=operatorRun();
 const [suppliedTx,...extra]=process.argv.slice(2);invariant(extra.length===0,'Use stage6-proof.mjs [EXECUTION_TX]');
 const file=resolve(folder,'proof-execution.json');
 const saved=parseJsonStrict(await readFile(resolve(folder,'checkpoint.json'),'utf8'));
 let txHash=suppliedTx;
 if(!txHash)txHash=parseJsonStrict(await readFile(file,'utf8')).txHash;
 invariant(typeof txHash==='string'&&/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash),'Execution transaction ID required');
 await rm(resolve(folder,'next-intent.json'),{force:true});await rm(resolve(folder,'next-args.json'),{force:true});
 const pool=createDatabasePool();
 try{
  // Reuse verified immutable bytes only within this command. Nested database
  // reads otherwise download the same source repeatedly and trigger rate limits.
  const archive=createEvidenceStorage(),verifiedBytes=new Map();
  const storage={put:(...args)=>archive.put(...args),get:async(key,digest)=>{
   const cacheKey=key+':'+digest;
   if(!verifiedBytes.has(cacheKey)){
    for(let attempt=0;attempt<3;attempt++){
     try{verifiedBytes.set(cacheKey,await archive.get(key,digest));break;}
     catch(e){if(e.message!=='Private evidence unavailable'||attempt===2)throw e;await delay(500*(attempt+1));}
    }
   }
   return verifiedBytes.get(cacheKey);
  }};
  const store=new PostgresExecutionStore(pool,'near_agent_work',storage,actor,contract,actor,profile);
  const detail=await store.details(saved.orderId);
  invariant(hash(detail.config.agreement)===saved.agreementHash&&detail.config.verificationMode===profile,'Proof checkpoint agreement mismatch');
  const plan=await store.teeSettlementPlan(saved.orderId);
  invariant(plan.state==='execute'&&typeof plan.inputData==='string','An unconsumed on-chain TEE request is required');
  const review=parseJsonStrict(await readFile(resolve(folder,plan.taskId+'-execution-review.json'),'utf8'));
  invariant(canonicalJson(review.intent.args)===canonicalJson(teeExecutionArgs(plan.inputData)),'Execution review differs from current pending input');
  const bytes=await readFile(resolve(folder,plan.taskId+'.proof.json'),'utf8');invariant(Buffer.byteLength(bytes)<=1048576,'Proof bundle too large');
  const bundle=parseJsonStrict(bytes.replace(/^\uFEFF/,''));
  requireWorkerMeasurements(bundle.attestation?.tdx_quote,TEE_MEASUREMENTS[profile]);
  const response=await fetch('https://rpc.testnet.fastnear.com',{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000),body:JSON.stringify({jsonrpc:'2.0',id:'tee-execution',method:'tx',params:{tx_hash:txHash,sender_account_id:actor,wait_until:'FINAL'}})});
  invariant(response.ok,'Execution receipt RPC unavailable');const payload=record(await readJsonResponse(response,524288),'execution RPC');invariant(!payload.error&&payload.id==='tee-execution','Final execution receipt unavailable');
  verifyExecutionReceipt(review.intent,txHash,payload.result,bundle);
  const args=prepareTeeProof(bundle,saved.orderId,plan.taskId);
  const v=parseJsonStrict(parseJsonStrict(bundle.output_raw)).result.verification;
  const envelope=detail.reports.find(e=>e.report.taskId===plan.taskId&&e.report.artifactHash===v.artifactHash&&e.report.artifactVersion===v.artifactVersion);
  invariant(envelope&&hash(v)===hash(teeVerificationSummary(envelope)),'TEE result differs from archived verification summary');
  // The full live escrow acceptance used ~213 Tgas. Preflight funds a
  // 250-Tgas budget, preserving headroom above that measured execution.
  const intent={network:'testnet',signerId:actor,receiverId:contract,methodName:'submit_tee_result',depositAtomic:'0',gasTgas:250,args};
  await writeFile(resolve(folder,plan.taskId+'-execution-receipt.json'),canonicalJson(payload.result)+'\n');
  await writeFile(file,canonicalJson({txHash,taskId:plan.taskId})+'\n');
  await writeFile(resolve(folder,'next-args.json'),canonicalJson(args)+'\n');await writeFile(resolve(folder,'next-intent.json'),canonicalJson(intent)+'\n');
  console.log(JSON.stringify({status:'OWNER_SIGNATURE_REQUIRED_CONTRACT_MUST_VERIFY',taskId:plan.taskId,method:intent.methodName,gasTgas:intent.gasTgas,depositAtomic:'0',decision:v.decision}));
 }finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e instanceof Error?e.message:'Proof preparation failed');process.exitCode=1;});
