import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,hashBytes} from '../packages/agreements/src/agreement.ts';
import {runLocalJudge,encodeJudgeInput,checkLocalJudgeOutput} from '../packages/judge/src/local-judge.ts';
import {judgeConformanceVectors} from '../scripts/judge-conformance-vectors.mjs';
const codeHash='sha256:'+'c'.repeat(64);
function prepared(index=0){const vector=judgeConformanceVectors(codeHash)[index],bytes=encodeJudgeInput(vector.input);return {vector,bytes,expected:{inputHash:hashBytes(bytes),codeHash}};}
test('local judge reference preserves deterministic decisions across seven adversarial conformance vectors',()=>{
 for(let i=0;i<7;i++){const {vector,bytes,expected}=prepared(i),output=runLocalJudge(bytes,expected);assert.equal(output.result.report.report.decision,vector.decision,vector.name);assert.equal(output.result.execution,'local-reference-not-attested');assert.deepEqual(checkLocalJudgeOutput(bytes,expected,output),{consistent:true,attested:false,settlementAuthorized:false});}
});
test('judge rejects altered input, code commitment, duplicate-key and noncanonical requests',()=>{
 const {vector,bytes,expected}=prepared();assert.throws(()=>runLocalJudge(bytes+' ',expected),/input commitment/);assert.throws(()=>runLocalJudge(bytes,{...expected,codeHash:'sha256:'+'a'.repeat(64)}),/code commitment/);
 const duplicate=bytes.replace('"schemaVersion":"1"','"schemaVersion":"1","schemaVersion":"1"');assert.throws(()=>runLocalJudge(duplicate,{...expected,inputHash:hashBytes(duplicate)}),/duplicate JSON key/);
 const spaced=JSON.stringify(vector.input,null,2);assert.throws(()=>runLocalJudge(spaced,{...expected,inputHash:hashBytes(spaced)}),/canonical JSON/);
});
test('judge result checker rejects swapped requests and rehashed forged acceptance',()=>{
 const a=prepared(),b=prepared(1),output=runLocalJudge(a.bytes,a.expected);assert.throws(()=>checkLocalJudgeOutput(b.bytes,b.expected,output),/context mismatch/);
 const forged=structuredClone(runLocalJudge(b.bytes,b.expected));forged.result.report.report.decision='accepted';forged.result.report.reportHash=hash(forged.result.report.report);forged.outputHash=hash(forged.result);assert.throws(()=>checkLocalJudgeOutput(b.bytes,b.expected,forged),/context mismatch/);
});
test('judge rejects cross-order dependency context rather than trusting supplied acceptance',()=>{
 const {vector}=prepared(4);vector.input.verification.acceptedDependencies[0].orderId='different-order';const bytes=encodeJudgeInput(vector.input);assert.throws(()=>runLocalJudge(bytes,{inputHash:hashBytes(bytes),codeHash}),/cross-order/);
});
test('judge rejects a consistently rehashed downgrade to legacy verification policy',()=>{
 const vector=structuredClone(prepared().vector),v=vector.input.verification;v.policy.schemaVersion='1';
 v.agreement.tasks[0].verificationPolicyHash=hash(v.policy);v.approvedAgreementHash=hash(v.agreement);
 const bytes=encodeJudgeInput(vector.input);assert.throws(()=>runLocalJudge(bytes,{inputHash:hashBytes(bytes),codeHash}),/profile v2/);
});
