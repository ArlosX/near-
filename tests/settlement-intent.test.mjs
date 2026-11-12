import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/verification.mjs';
import {verifySubmission} from '../packages/verification/src/report.ts';
import {nextSettlementIntent} from '../packages/agreements/src/settlement-intent.ts';

test('settlement binds the verifier and verdict to the approved dependency graph and report',()=>{
 const input=fixture(),agreement=input.agreement,report=verifySubmission(input);
 const time=BigInt(input.evaluatedAtNs);
 const order={
  order_id:agreement.orderId,agreement_hash:input.approvedAgreementHash,client:agreement.clientAccountId,
  verifier:agreement.verifierAccountId,principal:agreement.totalAmountAtomic,cutoff_ns:agreement.resultCutoffNs,
  status:'Open',refunded:false,tasks:agreement.tasks.map(task=>({
   id:task.id,recipient:task.recipientAccountId,amount:task.amountAtomic,depends_on:task.dependsOn,result:null
  }))
 };
 const next=nextSettlementIntent(agreement,order,[report],time);
 assert.equal(next.intent.signerId,agreement.verifierAccountId);
 assert.equal(next.intent.methodName,'record_subtask_result');
 assert.equal(next.intent.args.task_id,'extract');
 assert.equal(next.intent.args.report_hash,report.reportHash);
 assert.throws(()=>nextSettlementIntent(agreement,order,[],time),/Accepted deterministic report/);
 order.tasks[0].result={accepted:true,report_hash:report.reportHash,artifact_hash:'incorrect'};
 assert.throws(()=>nextSettlementIntent(agreement,order,[report],time),/Recorded result differs/);
});
