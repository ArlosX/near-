import {Worker} from 'near-workspaces';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {prepareTeeProof} from '../../scripts/prepare-tee-proof.mjs';
const base=new URL('../../artifacts/local/outlayer-proof/',import.meta.url);
await mkdir(base,{recursive:true});
const read=async name=>JSON.parse((await readFile(new URL('../fixtures/tee/'+name,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const wasm=await readFile(new URL('../../contracts/work-escrow/target/wasm32-unknown-unknown/release/tee_proof_bench.wasm',import.meta.url));
const worker=await Worker.init({network:'sandbox'});const reports=[];
try {
 const root=worker.rootAccount;const contract=await root.devDeploy(wasm,{initialBalance:100n*10n**24n});
 await contract.call(contract,'new',{});
 for(const name of ['extract','compare']) {
  const proof=await read(name+'.proof.json');
  const wrapper=JSON.parse(proof.input_raw),inner=JSON.parse(wrapper.inputBytes),v=JSON.parse(JSON.parse(proof.output_raw)).result.verification;
  const args=prepareTeeProof(proof,v.orderId,v.taskId);delete args.order_id;delete args.task_id;
  args.agreement_hash=v.agreementHash;
  args.pending={task_id:v.taskId,request_id:inner.requestId,revision:inner.verification.revision,artifact_hash:v.artifactHash,policy_hash:v.policyHash,inner_hash:wrapper.expectedInputHash,input_hash:proof.attestation.input_hash,prepared_at_ns:(BigInt(proof.attestation.timestamp)*1000000000n).toString()};
  const claim=await root.callRaw(contract,'check_historical',args,{gas:300n*10n**12n});
  assert.equal(claim.failed,false);assert.equal(claim.parseResult(),'accepted');
  const claimGas=claim.result.receipts_outcome.reduce((sum,x)=>sum+BigInt(x.outcome.gas_burnt),BigInt(claim.result.transaction_outcome.outcome.gas_burnt));
  reports.push({name,kind:'production-claim-conformance',wasmBytes:wasm.length,gasBurnt:claimGas.toString(),failed:claim.failed,logs:claim.logs});
  for(const kind of ['valid','corrupt-quote','corrupt-collateral']) {
   const args={quote:proof.attestation.tdx_quote,collateral:proof.collateral,at:String(proof.attestation.timestamp)};
   if(kind==='corrupt-quote'){const q=Buffer.from(args.quote,'base64');q[100]^=1;args.quote=q.toString('base64');}
   if(kind==='corrupt-collateral'){const c=JSON.parse(args.collateral);if(typeof c.tcb_info_signature==='string')c.tcb_info_signature=(c.tcb_info_signature[0]==='0'?'1':'0')+c.tcb_info_signature.slice(1);else c.tcb_info_signature[0]^=1;args.collateral=JSON.stringify(c);}
   const result=await root.callRaw(contract,'verify',args,{gas:300n*10n**12n});
   const r=result.result;const gas=r.receipts_outcome.reduce((sum,x)=>sum+BigInt(x.outcome.gas_burnt),BigInt(r.transaction_outcome.outcome.gas_burnt));
   const report={name,kind,wasmBytes:wasm.length,gasBurnt:gas.toString(),logs:result.logs,failed:result.failed,status:r.status};
   reports.push(report);console.log(JSON.stringify(report));
   await writeFile(new URL('benchmark-'+name+'-'+kind+'.receipt.json',base),JSON.stringify(r,null,2));
   assert.equal(result.failed,kind!=='valid');
   if(kind==='valid')assert.equal(result.parseResult(),'UpToDate');
  }
 }
 await writeFile(new URL('onchain-crypto-benchmark.json',base),JSON.stringify(reports,null,2));
} finally {await worker.tearDown();}
