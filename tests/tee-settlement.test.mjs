import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,hash,hashBytes,fundingIntent} from '../packages/agreements/src/agreement.ts';
import {verifyFundingOutcome} from '../packages/agreements/src/funding-confirmation.ts';
import {createDemoConfig,artifactTemplate} from '../packages/orchestration/src/demo-data.ts';
import {verifySubmission} from '../packages/verification/src/report.ts';
import {TEE_PROFILE,TEE_CODE,validateTeeState,assertTeeTaskReady,planTeeTask,teeVerificationSummary} from '../packages/agreements/src/tee-settlement.ts';
const now=1794480000000000000n;
function fixture(){
 const config=createDemoConfig('tee-ui-test',now,'2500',3600,'owner.testnet','escrow.testnet','owner.testnet');config.verificationMode=TEE_PROFILE;
 const a=config.agreement;
 const order={order_id:a.orderId,agreement_hash:hash(a),client:a.clientAccountId,verifier:a.verifierAccountId,principal:a.totalAmountAtomic,cutoff_ns:a.resultCutoffNs,status:'Open',refunded:false,tasks:a.tasks.map(t=>({id:t.id,recipient:t.recipientAccountId,amount:t.amountAtomic,depends_on:t.dependsOn,result:null}))};
 const tee={verification_mode:TEE_PROFILE,code_hash:TEE_CODE,collateral_hash:'2e80992e78a9e76e5726db22b7399c553439574e6fe512a3b311ae4c3d559140',worker_measurements_hash:'5fccdb6924dbbe7ab09a4ca412e1b264196e44c47c795774326da89a376e45c3',state:{profile:TEE_PROFILE,agreement_json:canonicalJson(a),progress:a.tasks.map(t=>({task_id:t.id,revision:0,pending:null}))}};
 const bytes=canonicalJson(artifactTemplate('extract',1,config.suppliers,{},null));
 const request={agreement:a,approvedAgreementHash:hash(a),taskId:'extract',policy:config.policies.extract,sources:config.sources,artifactBytes:bytes,revision:0,evaluatedAtNs:now.toString(),acceptedDependencies:[]};
 const report=verifySubmission(request),artifacts=new Map([['extract:1',bytes]]);
 return {config,a,order,tee,report,artifacts};
}
test('TEE funding receipt cannot be confused with a legacy verifier funding receipt',()=>{
 const {a}=fixture(),txHash='A'.repeat(44),intent=fundingIntent(a,TEE_PROFILE);
 const outcome={final_execution_status:'FINAL',status:{SuccessValue:''},transaction:{hash:txHash,signer_id:a.clientAccountId,receiver_id:a.contractId,actions:[{FunctionCall:{method_name:intent.methodName,deposit:intent.depositAtomic,args:Buffer.from(canonicalJson(intent.args)).toString('base64')}}]}};
 assert.equal(verifyFundingOutcome(a,txHash,outcome,TEE_PROFILE).agreementHash,hash(a));
 assert.throws(()=>verifyFundingOutcome(a,txHash,outcome),/method or deposit/);
 const legacy=fundingIntent(a);outcome.transaction.actions[0].FunctionCall.method_name=legacy.methodName;
 assert.throws(()=>verifyFundingOutcome(a,txHash,outcome,TEE_PROFILE),/method or deposit/);
});
test('legacy profile and altered frozen agreement or allocation are rejected',()=>{
 const {a,order,tee}=fixture();validateTeeState(a,order,tee);
 assert.throws(()=>validateTeeState(a,order,{verification_mode:'designated-verifier'}),/profile mismatch/);
 const altered=structuredClone(tee);altered.state.agreement_json+=' ';assert.throws(()=>validateTeeState(a,order,altered),/Frozen/);
 order.tasks[0].amount='1';assert.throws(()=>validateTeeState(a,order,tee),/allocation/);
});
test('local acceptance cannot unlock downstream model execution or a premature retry',()=>{
 const {a,order,tee,report}=fixture();
 assert.doesNotThrow(()=>assertTeeTaskReady(a,order,tee,'extract',0,{},now));
 assert.throws(()=>assertTeeTaskReady(a,order,tee,'compare',0,{extract:report.report.artifactHash},now),/On-chain/);
 order.tasks[0].result={accepted:true,artifact_hash:report.report.artifactHash};
 assert.doesNotThrow(()=>assertTeeTaskReady(a,order,tee,'compare',0,{extract:report.report.artifactHash},now));
 assert.throws(()=>assertTeeTaskReady(a,order,tee,'compare',0,{extract:'sha256:'+'0'.repeat(64)},now),/exact bytes/);
 tee.state.progress[1].pending={};assert.throws(()=>assertTeeTaskReady(a,order,tee,'compare',0,{extract:report.report.artifactHash},now),/pending/);
 tee.state.progress[1].pending=null;assert.throws(()=>assertTeeTaskReady(a,order,tee,'compare',1,{extract:report.report.artifactHash},now),/on-chain revision/);
});
test('planner replays immutable reports and reconstructs exactly the on-chain commitment',()=>{
 const {config,order,tee,report,artifacts}=fixture();
 assert.equal(planTeeTask(config,order,tee,[],artifacts,now).state,'model');
 const prepared=planTeeTask(config,order,tee,[report],artifacts,now);assert.equal(prepared.state,'prepare');
 const request=JSON.parse(prepared.intent.args.verification_json),time=(now+1000000000n).toString();
 const inner=canonicalJson({schemaVersion:'1',requestId:'tee-7',codeHash:'sha256:'+TEE_CODE,verification:{...request,evaluatedAtNs:time}});
 const input=canonicalJson({inputBytes:inner,expectedInputHash:hashBytes(inner),expectedCodeHash:'sha256:'+TEE_CODE});
 tee.state.progress[0].pending={task_id:'extract',request_id:'tee-7',revision:0,artifact_hash:report.report.artifactHash,policy_hash:report.report.policyHash,inner_hash:hashBytes(inner),input_hash:hashBytes(input).slice(7),prepared_at_ns:time};
 const execute=planTeeTask(config,order,tee,[report],artifacts,now+2000000000n);assert.equal(execute.state,'execute');assert.equal(execute.inputData,input);
 assert.throws(()=>planTeeTask(config,order,tee,[],artifacts,now),/no matching archived/);
 tee.state.progress[0].pending.prepared_at_ns=now.toString();assert.throws(()=>planTeeTask(config,order,tee,[report],artifacts,now),/commitment mismatch/);
});
test('TEE result hashes use the guest verification summary, not the rich local report hash',()=>{
 const {config,order,tee,report,artifacts}=fixture();
 order.tasks[0].result={accepted:true,artifact_hash:report.report.artifactHash,report_hash:report.reportHash};
 assert.throws(()=>planTeeTask(config,order,tee,[report],artifacts,now),/accepted evidence mismatch/);
 order.tasks[0].result.report_hash=hash(teeVerificationSummary(report));
 assert.equal(planTeeTask(config,order,tee,[report],artifacts,now).taskId,'compare');
});

test('expired TEE orders expose refund actions without fabricating success or a replacement deadline',()=>{
 const {config,order,tee,artifacts}=fixture();
 assert.equal(planTeeTask(config,order,tee,[],artifacts,BigInt(config.agreement.resultCutoffNs)).state,'expire');
 order.status='Expired';assert.equal(planTeeTask(config,order,tee,[],artifacts,now).state,'refund');
 order.refunded=true;assert.equal(planTeeTask(config,order,tee,[],artifacts,now).state,'refunded');
});
