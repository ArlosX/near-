import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hash,hashBytes} from '../packages/agreements/src/agreement.ts';
import {verifyReportIntegrity,verifySubmission} from '../packages/verification/src/report.ts';
import {teeVerificationSummary} from '../packages/agreements/src/tee-settlement.ts';
import {modelArtifactBytes} from '../packages/model/src/artifact.ts';
import {prepareTeeProof} from '../scripts/prepare-tee-proof.mjs';
import {requireWorkerMeasurements} from '../scripts/tee-measurement-preflight.mjs';
import {TEE_MEASUREMENTS} from '../packages/shared/src/tee-profiles.ts';
import {verifyWithdrawalOutcome} from '../packages/agreements/src/withdrawal-confirmation.ts';
const read=name=>JSON.parse(readFileSync(new URL('./fixtures/release-v3/'+name,import.meta.url),'utf8'));

test('public live-run evidence replays both dependent checks and binds provider output, TEE context and withdrawal',()=>{
 const agreement=read('agreement.json'),provenance=read('model-provenance.json'),reports=read('reports.json');
 assert.equal(provenance.orderId,agreement.orderId);assert.equal(provenance.replay,false);assert.equal(provenance.tasks.length,2);
 for(const taskId of ['extract','compare']){
  const model=provenance.tasks.find(t=>t.taskId===taskId),envelope=reports.find(e=>e.report.taskId===taskId),bundle=read(taskId+'.proof.json');
  assert.equal(model.provider,'gemini');assert(model.responseSeq>model.reservedSeq);assert.equal(verifyReportIntegrity(envelope),true);
  assert.equal(hashBytes(modelArtifactBytes(model.completion.content)),envelope.report.artifactHash);
  const input=JSON.parse(JSON.parse(bundle.input_raw).inputBytes),result=verifySubmission(input.verification);
  assert.equal(result.report.decision,'accepted');assert.equal(result.report.artifactHash,envelope.report.artifactHash);
  const guest=JSON.parse(JSON.parse(bundle.output_raw)).result.verification;
  assert.equal(hash(guest),hash(teeVerificationSummary(envelope)));
  assert.equal(prepareTeeProof(bundle,agreement.orderId,taskId).output_data,bundle.output_raw);
  assert.doesNotThrow(()=>requireWorkerMeasurements(bundle.attestation.tdx_quote,TEE_MEASUREMENTS['outlayer-tdx-direct-v3']));
  if(taskId==='compare')assert.equal(input.verification.acceptedDependencies[0].artifactHash,reports.find(e=>e.report.taskId==='extract').report.artifactHash);
 }
 const receipt=read('withdrawal-receipt.json');
 assert.equal(verifyWithdrawalOutcome(agreement.contractId,agreement.clientAccountId,agreement.totalAmountAtomic,receipt.transaction.hash,receipt).status,'FINAL_PAID');
 // Fixtures reproduce consistency checks; they do not authenticate the RPC or Intel signature offline.
});
