import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareTeeProof} from '../scripts/prepare-tee-proof.mjs';
const fixture=name=>JSON.parse(readFileSync(new URL(`./fixtures/tee/${name}.proof.json`,import.meta.url),'utf8').replace(/^\uFEFF/,''));
function target(b){return JSON.parse(JSON.parse(b.output_raw)).result.verification;}
test('TEE proof transport preserves exact signed Text return bytes and has no decision authority',()=>{
 for(const name of ['extract','compare']){const b=fixture(name),v=target(b),args=prepareTeeProof(b,v.orderId,v.taskId);assert.equal(args.output_data,b.output_raw);assert.equal(args.collateral,b.collateral);assert.equal(args.proof.quote,b.attestation.tdx_quote);assert.equal(args.accepted,undefined);assert.equal(args.proof.timestamp,String(b.attestation.timestamp));}
});
test('TEE proof transport rejects wrong task, altered bytes, code and collateral',()=>{
 const b=fixture('extract'),v=target(b);
 assert.throws(()=>prepareTeeProof(b,v.orderId,'compare'),/wrong output/);
 for(const [mutate,reason] of [
  [x=>{x.input_raw+=' ';},/exact input/],
  [x=>{x.output_raw+=' ';},/exact Text/],
  [x=>{x.attestation.wasm_hash='0'.repeat(64);},/unsupported judge/],
  [x=>{x.collateral+=' ';},/unapproved collateral/],
  [x=>{x.attestation.project_id='other';},/unsupported attestation/]
 ]){const x=structuredClone(b);mutate(x);assert.throws(()=>prepareTeeProof(x,v.orderId,v.taskId),reason);}
});
test('bundle verdict booleans cannot become a TEE settlement instruction',()=>{
 const b=fixture('extract'),v=target(b),expected=prepareTeeProof(b,v.orderId,v.taskId);
 b.verification={authenticity:{verdict:'pass'},identity:{verdict:'pass'},binding:{verdict:'pass'}};b.measurements_approved=false;
 assert.deepEqual(prepareTeeProof(b,v.orderId,v.taskId),expected);
 // Transport deliberately leaves Intel signature verification to the contract.
 b.attestation.tdx_quote=Buffer.alloc(5006).toString('base64');
 const packet=prepareTeeProof(b,v.orderId,v.taskId);assert.equal(packet.accepted,undefined);assert.equal(packet.proof.quote,b.attestation.tdx_quote);
});
