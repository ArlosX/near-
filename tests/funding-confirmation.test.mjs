import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fundingIntent} from '../packages/agreements/src/agreement.ts';
import {verifyFundingOutcome} from '../packages/agreements/src/funding-confirmation.ts';
import {createDemoConfig} from '../packages/orchestration/src/demo-data.ts';

const hash='A'.repeat(44);
function fixture(){
 const {agreement:demo}=createDemoConfig('funding-fixture',BigInt(Date.now())*1000000n,'2500');
 const agreement={...demo,contractId:'escrow.testnet'};
 const intent=fundingIntent(agreement);
 const call={method_name:intent.methodName,deposit:intent.depositAtomic,args:Buffer.from(JSON.stringify(intent.args)).toString('base64')};
 const result={final_execution_status:'FINAL',status:{SuccessValue:''},transaction:{
  hash,signer_id:intent.signerId,receiver_id:intent.receiverId,actions:[{FunctionCall:call}]
 }};
 return {agreement,result,call,intent};
}
test('funding confirmation matches a final successful transfer to the approved order',()=>{
 const {agreement,result,intent}=fixture();
 assert.deepEqual(verifyFundingOutcome(agreement,hash,result),{txHash:hash,orderId:agreement.orderId,agreementHash:intent.args.agreement_hash,depositAtomic:intent.depositAtomic});
});
test('funding confirmation rejects pending, failed and substituted transactions',()=>{
 const {agreement,result,call,intent}=fixture();
 assert.throws(()=>verifyFundingOutcome(agreement,hash,{...result,final_execution_status:'EXECUTED'}),/not final/);
 assert.throws(()=>verifyFundingOutcome(agreement,hash,{...result,status:{Failure:{}}}),/execution failed/);
 assert.throws(()=>verifyFundingOutcome(agreement,hash,{...result,transaction:{...result.transaction,receiver_id:'another.testnet'}}),/identity mismatch/);
 call.args=Buffer.from(JSON.stringify({...intent.args,order_id:'another-order'})).toString('base64');
 assert.throws(()=>verifyFundingOutcome(agreement,hash,result),/differ from approved/);
 call.deposit='1';
 assert.throws(()=>verifyFundingOutcome(agreement,hash,result),/deposit mismatch/);
});
