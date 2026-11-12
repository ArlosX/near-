import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {canonicalJson,hash,hashBytes} from '../packages/agreements/src/agreement.ts';
import {runLocalJudge} from '../packages/judge/src/local-judge.ts';
import {identifier} from '../packages/shared/src/domain.ts';

const [evidencePath,wasmUrl]=process.argv.slice(2);
assert(evidencePath,'Usage: node scripts/prepare-outlayer-review.mjs EVIDENCE.json [PUBLISHED_WASM_HTTPS_URL]');
if(wasmUrl){const url=new URL(wasmUrl);assert(url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443'),'Published WASM must use HTTPS on the default port');}
const envelope=JSON.parse(readFileSync(evidencePath,'utf8'));
assert.equal(hash(envelope.content),envelope.packageHash,'Evidence package hash mismatch');
const content=envelope.content;identifier(content.orderId,'order');
const root=resolve(import.meta.dirname,'..');
const wasm=resolve(root,'packages/judge-wasi/target/wasm32-wasip2/release/agent-work-judge.wasm');
const runtime=resolve(root,'artifacts/local/wasmtime/wasmtime-v50.0.1-x86_64-windows/wasmtime.exe');
const wasmSha256=createHash('sha256').update(readFileSync(wasm)).digest('hex');
const codeHash='sha256:'+wasmSha256;
const out=resolve(root,'artifacts/local/outlayer-review',content.orderId);
mkdirSync(out,{recursive:true});copyFileSync(wasm,resolve(out,'judge.wasm'));
const jobs=[];
for(const task of content.agreement.tasks){
 const candidates=content.deliveries.filter(d=>d.taskId===task.id);
 const delivery=candidates.sort((a,b)=>b.outputVersion-a.outputVersion)[0];
 assert(delivery,'Missing task delivery');
 const acceptedDependencies=task.dependsOn.map(taskId=>{
  const parent=content.deliveries.filter(d=>d.taskId===taskId&&d.report.report.decision==='accepted').sort((a,b)=>b.outputVersion-a.outputVersion)[0];
  assert(parent,'Missing accepted dependency');
  return {orderId:content.orderId,taskId,agreementHash:content.agreementHash,artifactHash:parent.fileHash,artifactBytes:parent.artifactBytes};
 });
 const input={schemaVersion:'1',requestId:task.id+'-v'+delivery.outputVersion,codeHash,verification:{agreement:content.agreement,approvedAgreementHash:content.agreementHash,taskId:task.id,policy:content.policies[task.id],sources:content.sources,artifactBytes:delivery.artifactBytes,revision:delivery.outputVersion-1,evaluatedAtNs:delivery.evaluatedAtNs,acceptedDependencies}};
 const inputBytes=canonicalJson(input),wrapper={inputBytes,expectedInputHash:hashBytes(inputBytes),expectedCodeHash:codeHash};
 const reference=runLocalJudge(inputBytes,{inputHash:wrapper.expectedInputHash,codeHash});
 const local=spawnSync(runtime,['run',wasm],{input:canonicalJson(wrapper),encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,windowsHide:true});
 assert.ifError(local.error);assert.equal(local.status,0,local.stderr);
 const result=JSON.parse(local.stdout);assert.equal(hash(result.result),result.outputHash);
 const report=reference.result.report.report;
 assert.deepEqual(result.result.verification.checks,report.checks.map(({criterionId,checker,passed})=>({criterionId,checker,passed})));
 assert.equal(result.result.verification.decision,report.decision);
 assert.equal(result.result.inputHash,wrapper.expectedInputHash);assert.equal(result.result.codeHash,codeHash);
 const inputData=canonicalJson(wrapper);
 writeFileSync(resolve(out,task.id+'.stdin.json'),inputData);
 writeFileSync(resolve(out,task.id+'.local-result.json'),JSON.stringify(result,null,2));
 const job={taskId:task.id,decision:report.decision,guestInputHash:hashBytes(inputData),innerInputHash:wrapper.expectedInputHash,inputBytes:Buffer.byteLength(inputData)};
 jobs.push(job);
 if(wasmUrl)writeFileSync(resolve(out,task.id+'.request-execution.json'),JSON.stringify({source:{WasmUrl:{url:wasmUrl,hash:wasmSha256,build_target:'wasm32-wasip2'}},resource_limits:{max_instructions:1000000000,max_memory_mb:128,max_execution_seconds:30},input_data:inputData,response_format:'Text'},null,2));
}
const manifest={network:'testnet',receiverId:'outlayer.testnet',wasmSha256,wasmUrl:wasmUrl??null,orderId:content.orderId,jobs,localConformance:'passed',remoteExecution:'pending',attestation:'pending',settlementAuthority:false,evaluationTime:'Historical report time supplied for replay; fresh funded requests require service-owned current context.',nextGate:wasmUrl?'Verify the published bytes hash, estimate actual input cost and review owner signature.':'Publish judge.wasm on HTTPS, then regenerate with the published URL.'};
writeFileSync(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({directory:out,...manifest},null,2));
