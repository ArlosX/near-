import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyExecutionReceipt} from '../scripts/stage6-proof.mjs';
import {teeExecutionIntent} from '../packages/agreements/src/tee-execution.ts';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/tee/extract.proof.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
test('TEE proof transport binds final transaction, caller, exact execution arguments and raw Text return',()=>{
 const b=fixture(),id='A'.repeat(44),expected=teeExecutionIntent(b.input_raw,b.attestation.caller_account_id,'4000100000000000000000');
 const r={final_execution_status:'FINAL',status:{SuccessValue:Buffer.from(b.output_raw).toString('base64')},transaction:{hash:id,signer_id:expected.signerId,receiver_id:'outlayer.testnet',actions:[{FunctionCall:{method_name:'request_execution',deposit:expected.depositAtomic,args:Buffer.from(JSON.stringify(expected.args)).toString('base64')}}]}};
 assert.equal(verifyExecutionReceipt(expected,id,r,b),true);
 for(const mutate of [x=>{x.final_execution_status='EXECUTED';},x=>{x.transaction.signer_id='other.testnet';},x=>{x.transaction.actions[0].FunctionCall.deposit='1';},x=>{x.status.SuccessValue=Buffer.from(b.output_raw+' ').toString('base64');}]){const x=structuredClone(r);mutate(x);assert.throws(()=>verifyExecutionReceipt(expected,id,x,b));}
 assert.throws(()=>verifyExecutionReceipt(expected,id,r,{...b,input_raw:b.input_raw+' '}),/input or caller/);
});
