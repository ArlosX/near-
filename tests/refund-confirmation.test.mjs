import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../packages/agreements/src/agreement.ts';
import {refundState} from '../packages/agreements/src/refund-confirmation.ts';
import {createDemoConfig} from '../packages/orchestration/src/demo-data.ts';

test('refund path follows finalized expiry, pending transfer and successful callback',()=>{
 const {agreement}=createDemoConfig('refund-test',BigInt(Date.now())*1000000n,'2500');
 const time=BigInt(agreement.resultCutoffNs);
 const order={order_id:agreement.orderId,client:agreement.clientAccountId,agreement_hash:hash(agreement),
  principal:agreement.totalAmountAtomic,cutoff_ns:agreement.resultCutoffNs,status:'Open',refund_pending:null,refunded:false};
 assert.equal(refundState(agreement,order,time-1n),'unavailable');
 assert.equal(refundState(agreement,order,time),'expire');
 assert.equal(refundState(agreement,{...order,tasks:agreement.tasks.map(()=>({result:{accepted:true}}))},time),'unavailable');
 const expired={...order,status:'Expired'};
 assert.equal(refundState(agreement,expired,time),'claim');
 assert.equal(refundState(agreement,{...expired,refund_pending:{operation:'1'}},time),'pending');
 assert.equal(refundState(agreement,{...expired,refunded:true},time),'refunded');
 assert.throws(()=>refundState(agreement,{...expired,refunded:true,principal:'1'},time),/does not match/);
});
