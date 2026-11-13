import {Worker} from 'near-workspaces';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {prepareTeeProof} from '../../scripts/prepare-tee-proof.mjs';
const folder=new URL('../../artifacts/local/worker-profile-v3/',import.meta.url);
const wasm=await readFile(new URL('tee_proof_bench_v3.wasm',folder));
const fresh=JSON.parse(await readFile(new URL('../fixtures/tee/worker-v2.proof.json',import.meta.url),'utf8'));
const old=JSON.parse((await readFile(new URL('../fixtures/tee/extract.proof.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const worker=await Worker.init({network:'sandbox'});const results=[];
function args(b){const v=JSON.parse(JSON.parse(b.output_raw)).result.verification,w=JSON.parse(b.input_raw),inner=JSON.parse(w.inputBytes);const a=prepareTeeProof(b,v.orderId,v.taskId);delete a.order_id;delete a.task_id;return {...a,agreement_hash:v.agreementHash,pending:{task_id:v.taskId,request_id:inner.requestId,revision:inner.verification.revision,artifact_hash:v.artifactHash,policy_hash:v.policyHash,inner_hash:w.expectedInputHash,input_hash:b.attestation.input_hash,prepared_at_ns:(BigInt(b.attestation.timestamp)*1000000000n).toString()}};}
try{const root=worker.rootAccount,contract=await root.devDeploy(wasm,{initialBalance:100n*10n**24n});await contract.call(contract,'new',{});
for(const name of ['fresh-valid','old-worker','old-worker-under-v2','fresh-worker-under-v1','tampered-quote','tampered-output']){let b=structuredClone(name.startsWith('old-worker')?old:fresh);if(name==='tampered-quote'){const q=Buffer.from(b.attestation.tdx_quote,'base64');q[100]^=1;b.attestation.tdx_quote=q.toString('base64');}const a=args(b);if(name==='old-worker-under-v2')a.profile='outlayer-tdx-direct-v2';if(name==='fresh-worker-under-v1')a.profile='outlayer-tdx-direct-v1';if(name==='tampered-output')a.output_data+=' ';const r=await root.callRaw(contract,'check_historical',a,{gas:300n*10n**12n});const item={name,failed:r.failed,logs:r.logs};results.push(item);console.log(JSON.stringify(item));assert.equal(r.failed,!['fresh-valid','old-worker'].includes(name));if(['fresh-valid','old-worker'].includes(name))assert.equal(r.parseResult(),'accepted');if(name==='old-worker-under-v2'||name==='fresh-worker-under-v1')assert.match(JSON.stringify(r.result),/worker measurements mismatch/);}
await writeFile(new URL('crypto-conformance.json',folder),JSON.stringify({passed:true,results},null,2));}finally{await worker.tearDown();}
