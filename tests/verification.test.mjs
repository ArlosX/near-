import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, hash, hashBytes } from '../packages/agreements/src/agreement.ts';
import { verifySubmission, verifyReportIntegrity } from '../packages/verification/src/report.ts';
import { fixture, editArtifact } from './fixtures/verification.mjs';

test('extraction report binds exact agreement, policy, source corpus, bytes and evaluator',()=>{
 const r=fixture(),e=verifySubmission(r);assert.equal(e.report.decision,'accepted');
 assert.equal(e.report.agreementHash,r.approvedAgreementHash);assert.equal(e.report.policyHash,hash(r.policy));assert.equal(e.report.sourceManifestHash,hash(r.sources));assert.equal(e.report.artifactHash,hashBytes(r.artifactBytes));assert.equal(e.report.evaluatorAccountId,'verifier.testnet');assert.equal(e.report.scope,'deterministic_only');assert.equal(verifyReportIntegrity(e),true);
 assert.equal(e.reportHash,verifySubmission(r).reportHash);
});
test('policy parameters and checker list cannot be changed after approval',()=>{
 for(const change of [r=>r.policy.constraints.budgetMinor='999999',r=>r.policy.criteria.pop(),r=>r.agreement.tasks[0].recipientAccountId='attacker.testnet']) {const r=fixture();change(r);assert.throws(()=>verifySubmission(r),/hash mismatch/);}
});
test('approved profile cannot omit mandatory checks even if all hashes are recomputed',()=>{
 const r=fixture();r.policy.criteria=[r.policy.criteria[0]];r.agreement.tasks[0].criteria=r.policy.criteria;r.agreement.tasks[0].verificationPolicyHash=hash(r.policy);r.approvedAgreementHash=hash(r.agreement);assert.throws(()=>verifySubmission(r),/omits mandatory/);
});
test('source edits and duplicate documents fail before artifact evaluation',()=>{
 const r=fixture();r.sources[0].text+=' changed';assert.throws(()=>verifySubmission(r),/source manifest/);
 const d=fixture();d.sources[1].id=d.sources[0].id;assert.throws(()=>verifySubmission(d),/duplicate source/);
});
test('malformed worker output produces bounded revision feedback, not acceptance',()=>{
 for(const bytes of ['not JSON','null','{}','{"taskId":"extract","taskId":"compare"}']) {const r=fixture();r.artifactBytes=bytes;const e=verifySubmission(r);assert.equal(e.report.decision,'revision_required');assert.equal(e.report.checks[0].passed,false);assert.equal(e.report.artifactHash,hashBytes(bytes));}
 for(const change of [a=>a.suppliers[0].unitPriceMinor=1000,a=>a.suppliers[0].quote='',a=>a.suppliers[0].surprise=true,a=>a.version=2,a=>a.taskId='compare',a=>a.suppliers.push(a.suppliers[0])]) {const r=editArtifact(fixture(),change);assert.equal(verifySubmission(r).report.decision,'revision_required');}
});
test('suppliers cannot be silently omitted or mapped twice to one source',()=>{
 for(const change of [a=>a.suppliers.pop(),a=>a.suppliers[1].sourceId=a.suppliers[0].sourceId]) {const e=verifySubmission(editArtifact(fixture(),change));assert.equal(e.report.decision,'revision_required');assert.equal(e.report.checks.find(c=>c.checker==='source_coverage').passed,false);}
});
test('alternative failed and repaired final attempts preserve prior report',()=>{
 const bad=editArtifact(fixture(),a=>a.suppliers[0].totalMinor='10');const first=verifySubmission(bad);assert.equal(first.report.decision,'revision_required');
 bad.revision=1;editArtifact(bad,a=>a.version=2);const last=verifySubmission(bad);assert.equal(last.report.decision,'rejected');
 // Alternative branch, not a resubmission after a persisted terminal rejection.
 const good=fixture();good.revision=1;editArtifact(good,a=>a.version=2);const repaired=verifySubmission(good);assert.equal(repaired.report.decision,'accepted');assert.equal(repaired.report.artifactVersion,2);assert.notEqual(first.reportHash,repaired.reportHash);assert.equal(first.report.decision,'revision_required');
 assert.throws(()=>{first.report.checks[0].passed=false;},TypeError);
 bad.revision=2;assert.throws(()=>verifySubmission(bad),/revision/);
});
test('comparison validates frozen dependencies and preserves accepted facts',()=>{
 const r=fixture('comparison');assert.equal(verifySubmission(r).report.decision,'accepted');
 const changed=editArtifact(fixture('comparison'),a=>{a.suppliers[0].unitPriceMinor='900';a.suppliers[0].totalMinor='1900';});
 const e=verifySubmission(changed);assert.equal(e.report.decision,'revision_required');assert.equal(e.report.checks.find(c=>c.checker==='dependency_facts').passed,false);
 const wrong=editArtifact(fixture('comparison'),a=>a.inputArtifactHashes.extract='sha256:'+'f'.repeat(64));assert.equal(verifySubmission(wrong).report.decision,'revision_required');
});
test('authoritative dependency context rejects missing, cross-order or corrupted records',()=>{
 for(const change of [r=>r.acceptedDependencies=[],r=>r.acceptedDependencies[0].orderId='other',r=>r.acceptedDependencies[0].artifactBytes+=' ',r=>r.acceptedDependencies[0].agreementHash='sha256:'+'a'.repeat(64)]) {const r=fixture('comparison');change(r);assert.throws(()=>verifySubmission(r));}
});
test('ineligible supplier is a business result; correct no-eligible conclusion can pass',()=>{
 const extract=verifySubmission(fixture('extraction','500'));assert.equal(extract.report.decision,'accepted');
 const r=fixture('comparison','500');editArtifact(r,a=>a.selectedSupplierId=null);assert.equal(verifySubmission(r).report.decision,'accepted');
 const invented=fixture('comparison','500');assert.equal(verifySubmission(invented).report.decision,'revision_required');
});
test('unknown delivery cannot establish eligibility and eligible option cannot be hidden',()=>{
 const r=editArtifact(fixture('comparison'),a=>a.selectedSupplierId='b');assert.equal(verifySubmission(r).report.decision,'revision_required');
 const hidden=editArtifact(fixture('comparison'),a=>a.selectedSupplierId=null);assert.equal(verifySubmission(hidden).report.decision,'revision_required');
});
test('integrity detects report tampering but does not claim authenticity',()=>{
 const e=verifySubmission(fixture());const tampered=structuredClone(e);tampered.report.evaluatorAccountId='attacker.testnet';assert.equal(verifyReportIntegrity(tampered),false);
 tampered.reportHash=hash(tampered.report);assert.equal(verifyReportIntegrity(tampered),true); // Integrity is not authentication.
 assert.equal(verifyReportIntegrity({report:e.report,reportHash:'bad'}),false);
});
test('verification rejects cutoff, unsupported task and overlarge artifact',()=>{
 const expired=fixture();expired.evaluatedAtNs='1000';assert.throws(()=>verifySubmission(expired),/future/);
 const unknown=fixture();unknown.taskId='missing';assert.throws(()=>verifySubmission(unknown),/unknown task/);
 const huge=fixture();huge.artifactBytes=' '.repeat(1000001);assert.throws(()=>verifySubmission(huge),/1MB/);
});
