import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJsonStrict,readJsonResponse} from '../packages/shared/src/json.ts';
import {canonicalJson,hash,hashBytes} from '../packages/agreements/src/agreement.ts';
import {fixture} from './fixtures/verification.mjs';
import {verifySubmission} from '../packages/verification/src/report.ts';
import {recheckSettlementEvidence} from '../packages/verification/src/settlement-evidence.ts';

test('strict JSON rejects duplicate keys, escaped aliases and excessive nesting',()=>{
 for(const input of ['{"allow":false,"allow":true}','{"a":1,"\\u0061":2}','{"v":{"x":1,"x":2}}'])assert.throws(()=>parseJsonStrict(input),/duplicate/);
 assert.throws(()=>parseJsonStrict('['.repeat(65)+'0'+']'.repeat(65)),/depth/);
 assert.deepEqual(parseJsonStrict('{"a":[{"x":1},{"x":2}],"text":"{},:\\""}'),{a:[{x:1},{x:2}],text:'{},:"'});
});

test('bounded RPC reads reject declared and chunked overflow, malformed UTF-8 and ambiguous JSON',async()=>{
 await assert.rejects(readJsonResponse(new Response('{}',{headers:{'content-length':'1000000'}}),128),/too large/);
 let cancelled=false;
 const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(100));},cancel(){cancelled=true;}});
 await assert.rejects(readJsonResponse(new Response(body),128),/too large/);assert.equal(cancelled,true);
 await assert.rejects(readJsonResponse(new Response(new Uint8Array([0xff])),128));
 await assert.rejects(readJsonResponse(new Response('{"result":false,"result":true}'),128),/duplicate/);
 assert.deepEqual(await readJsonResponse(new Response('{"ok":true}'),128),{ok:true});
});

function evidence(){
 const first=fixture(),second=fixture('comparison');
 const config={agreement:first.agreement,policies:{extract:first.policy,compare:second.policy},sources:first.sources};
 const reports=[verifySubmission(first),verifySubmission(second)];
 const artifacts=new Map([['extract:1',first.artifactBytes],['compare:1',second.artifactBytes]]);
 return {config,reports,artifacts};
}

test('settlement replays verification of the whole dependency chain from exact bytes',()=>{
 const {config,reports,artifacts}=evidence();
 assert.equal(recheckSettlementEvidence(config,reports,artifacts,'compare').reportHash,reports[1].reportHash);
 artifacts.set('extract:1','{}');
 assert.throws(()=>recheckSettlementEvidence(config,reports,artifacts,'compare'),/artifact bytes/);
});

test('forged accepted report with recomputed hashes cannot bypass settlement verification',()=>{
 const {config,reports,artifacts}=evidence();
 const forged=structuredClone(reports[0]);
 const artifact=JSON.parse(artifacts.get('extract:1'));artifact.suppliers[0].unitPriceMinor='1';artifact.suppliers[0].totalMinor='102';
 const bytes=canonicalJson(artifact);artifacts.set('extract:1',bytes);
 forged.report.artifactHash=hashBytes(bytes);forged.reportHash=hash(forged.report);reports[0]=forged;
 assert.throws(()=>recheckSettlementEvidence(config,reports,artifacts,'extract'),/revalidation failed/);
});

test('settlement rejects duplicate accepted evidence and missing predecessor bytes',()=>{
 const x=evidence();x.reports.push(x.reports[0]);
 assert.throws(()=>recheckSettlementEvidence(x.config,x.reports,x.artifacts,'compare'),/Exactly one/);
 const y=evidence();y.artifacts.delete('extract:1');
 assert.throws(()=>recheckSettlementEvidence(y.config,y.reports,y.artifacts,'compare'),/bytes/);
});
