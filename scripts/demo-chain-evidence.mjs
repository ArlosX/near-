import assert from 'node:assert/strict';
const contract='arlos.testnet';
const successId='demo-ae48c6ad4c64ccb1ea619980bbdae3a896a444dcba75ecf1';
const refundId='demo-59db7f8af6913eb8350a9ba8d689cfc30c165946135dbd9d';
const withdrawal='61emgbcx2Lu4Vomy335PqATm5FK6nVt68TCdpyGTHFS4';
async function rpc(method,params){
 let lastError;
 const endpoints=method==='tx'?['https://archival-rpc.testnet.fastnear.com','https://rpc.testnet.fastnear.com']:['https://rpc.testnet.fastnear.com','https://rpc.testnet.near.org'];
 for(const endpoint of endpoints){
 try{
 const response=await fetch(endpoint,{
  method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})
 });
 assert.ok(response.ok,'RPC returned HTTP '+response.status);
 const body=await response.json();
 assert.ok(body.result,JSON.stringify(body.error));
 return body.result;
 }catch(error){lastError=error;}
 }
 throw new Error('Testnet evidence request failed: '+method,{cause:lastError});
}
async function order(order_id){
 const data=await rpc('query',{request_type:'call_function',account_id:contract,
  method_name:'get_order',args_base64:Buffer.from(JSON.stringify({order_id})).toString('base64'),finality:'final'});
 return JSON.parse(Buffer.from(data.result).toString());
}
const [success,refund,tx]=await Promise.all([order(successId),order(refundId),rpc('tx',{
 tx_hash:withdrawal,sender_account_id:'arlosx.testnet',wait_until:'FINAL'
})]);
assert.equal(success.status,'SuccessCredited');
assert.equal(success.agreement_hash,'sha256:8e12e91cdd3a210f1954f599cdf656a72be44d89fc33197ce74cacaf609a948e');
assert.deepEqual(success.tasks.map(t=>[t.id,t.depends_on,t.result?.accepted]),[['extract',[],true],['compare',['extract'],true]]);
assert.equal(refund.status,'Expired');
assert.equal(refund.refunded,true);
assert.equal(refund.principal,'1000000000000000000000');
assert.equal(tx.final_execution_status,'FINAL');
assert.equal(tx.transaction.hash,withdrawal);
assert.equal(tx.transaction.receiver_id,contract);
assert.equal(tx.transaction.signer_id,'arlosx.testnet');
assert.equal(tx.transaction.actions[0].FunctionCall.method_name,'withdraw_claimable');
assert.equal(Buffer.from(tx.status.SuccessValue,'base64').toString(),'true');
const events=tx.receipts_outcome.filter(r=>r.outcome.executor_id===contract).flatMap(r=>r.outcome.logs)
 .filter(log=>log.startsWith('EVENT_JSON:')).map(log=>JSON.parse(log.slice(11)));
assert.ok(events.some(e=>e.standard==='work_escrow'&&e.event==='withdrawal_resolved'&&
 e.data.some(d=>d.recipient==='arlosx.testnet'&&d.success===true&&d.amount==='1000000000000000000000')));
console.log('Verified: two accepted dependent tasks, final 0.001 NEAR withdrawal, and expired-order refund on Testnet.');
