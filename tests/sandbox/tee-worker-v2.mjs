import {Worker} from 'near-workspaces';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {prepareTeeProof} from '../../scripts/prepare-tee-proof.mjs';
const folder=new URL('../../artifacts/local/worker-profile-v2/',import.meta.url);
const wasm=await readFile(new URL('tee_proof_bench_v2.wasm',folder));
const fresh=JSON.parse(await readFile(new URL('../stage6-success-live/extract.proof.json',folder),'utf8'));
const old=JSON.parse((await readFile(new URL('../fixtures/tee/extract.proof.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const worker=await Worker.init({network:'sandbox'});const results=[];
function args(b){const v=JSON.parse(JSON.parse(b.output_raw)).result.verification,w=JSON.parse(b.input_raw),inner=JSON.parse(w.inputBytes);const a=prepareTeeProof(b,v.orderId,v.taskId);delete a.order_id;delete a.task_id;return {...a,agreement_hash:v.agreementHash,pending:{task_id:v.taskId,request_id:inner.requestId,revision:inner.verification.revision,artifact_hash:v.artifactHash,policy_hash:v.policyHash,inner_hash:w.expectedInputHash,input_hash:b.attestation.input_hash,prepared_at_ns:(BigInt(b.attestation.timestamp)*1000000000n).toString()}};}
try{const root=worker.rootAccount,contract=await root.devDeploy(wasm,{initialBalance:100n*10n**24n});await contract.call(contract,'new',{});
for(const name of ['fresh-valid','old-worker','tampered-quote']){let b=structuredClone(name==='old-worker'?old:fresh);if(name==='tampered-quote'){const q=Buffer.from(b.attestation.tdx_quote,'base64');q[100]^=1;b.attestation.tdx_quote=q.toString('base64');}const r=await root.callRaw(contract,'check_historical',args(b),{gas:300n*10n**12n});const item={name,failed:r.failed,logs:r.logs};results.push(item);console.log(JSON.stringify(item));assert.equal(r.failed,name!=='fresh-valid');if(name==='fresh-valid')assert.equal(r.parseResult(),'accepted');if(name==='old-worker')assert.match(JSON.stringify(r.result),/worker measurements mismatch/);}
await writeFile(new URL('crypto-conformance.json',folder),JSON.stringify({passed:true,results},null,2));}finally{await worker.tearDown();}
