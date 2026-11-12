import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWithdrawalOutcome} from '../packages/agreements/src/withdrawal-confirmation.ts';
test('payment requires matching final transfer operation and successful private callback, never just an empty balance',()=>{
 const contract='escrow.testnet',recipient='owner.testnet',amount='100',tx='A'.repeat(44);
 const event=(type,success)=>'EVENT_JSON:'+JSON.stringify({standard:'work_escrow',event:type,data:[{recipient,amount,operation:'7',...(success===undefined?{}:{success})}]});
 const r={final_execution_status:'FINAL',status:{SuccessValue:'dHJ1ZQ=='},transaction:{hash:tx,signer_id:recipient,receiver_id:contract,actions:[{FunctionCall:{method_name:'withdraw_claimable',deposit:'0',args:'e30='}}]},receipts_outcome:[{outcome:{executor_id:contract,status:{SuccessValue:''},logs:[event('withdrawal_pending'),event('withdrawal_resolved',true)]}}]};
 assert.equal(verifyWithdrawalOutcome(contract,recipient,amount,tx,r).status,'FINAL_PAID');
 for(const mutate of [x=>{x.final_execution_status='EXECUTED';},x=>{x.transaction.receiver_id='other.testnet';},x=>{x.receipts_outcome[0].outcome.logs=[event('withdrawal_pending'),event('withdrawal_resolved',false)];},x=>{x.receipts_outcome[0].outcome.executor_id='other.testnet';},x=>{x.receipts_outcome[0].outcome.status={Failure:{}};}]){const x=structuredClone(r);mutate(x);assert.throws(()=>verifyWithdrawalOutcome(contract,recipient,amount,tx,x));}
 assert.throws(()=>verifyWithdrawalOutcome(contract,recipient,'101',tx,r));assert.throws(()=>verifyWithdrawalOutcome(contract,recipient,amount,tx,{available:'0'}));
});
