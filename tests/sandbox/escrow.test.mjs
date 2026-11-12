import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker} from 'near-workspaces';
import {canonicalJson,hash as hashValue,hashBytes} from '../../packages/agreements/src/agreement.ts';
import {judgeConformanceVectors} from '../../scripts/judge-conformance-vectors.mjs';

assert.equal(process.platform,'linux','Run Sandbox tests inside Linux/WSL. Windows native unit tests are separate.');
const wasm=await readFile(new URL('../../contracts/work-escrow/target/wasm32-unknown-unknown/release/work_escrow.wasm',import.meta.url));
const actorWasm=await readFile(new URL('../../contracts/work-escrow/target/wasm32-unknown-unknown/release/escrow_test_actor.wasm',import.meta.url));
const NEAR=10n**24n,GAS=150n*10n**12n,hash='sha256:'+'a'.repeat(64);
async function setup(t){
 const worker=await Worker.init({network:'sandbox'});t.after(()=>worker.tearDown());
 const root=worker.rootAccount;
 const escrow=await root.devDeploy(wasm,{initialBalance:50n*NEAR});
 // new is private: initialize using the newly created escrow account's own key.
 await escrow.call(escrow,'new',{}, {gas:GAS});
 const client=await root.createSubAccount('client',{initialBalance:20n*NEAR});
 await escrow.call(escrow,'set_client_admission',{client:client.accountId,allowed:true},{gas:GAS});
 const verifier=await root.createSubAccount('verifier');
 const recipient=await root.createSubAccount('recipient');
 const call=(who,method,args={},attachedDeposit=0n)=>who.call(escrow,method,args,{gas:GAS,attachedDeposit});
 async function fund(id='order',owner=client,payee=recipient,seconds=3600){
  const block=await worker.provider.block({finality:'final'});
  const cutoff=BigInt(block.header.timestamp_nanosec)+BigInt(seconds)*1000000000n;
  const args={order_id:id,agreement_hash:hash,verifier:verifier.accountId,cutoff_ns:cutoff.toString(),tasks:[{id:'extract',recipient:payee.accountId,amount:(NEAR*4n/10n).toString(),depends_on:[]},{id:'compare',recipient:payee.accountId,amount:(NEAR*6n/10n).toString(),depends_on:['extract']}]};
  await call(owner,'create_work_order',args,NEAR);return args;
 }
 const result=(id,task,accepted=true)=>call(verifier,'record_subtask_result',{order_id:id,task_id:task,accepted,report_hash:hash,artifact_hash:hash});
 const accept=async id=>{await result(id,'extract');await result(id,'compare');};
 const order=id=>escrow.view('get_order',{order_id:id});
 const balance=account=>escrow.view('get_balance',{account:account.accountId});
 const accounting=()=>escrow.view('get_accounting',{});
 async function actor(){const a=await root.createSubAccount('actor',{initialBalance:20n*NEAR});await a.deploy(actorWasm);await a.call(a,'new',{});await call(escrow,'set_client_admission',{client:a.accountId,allowed:true});return a;}
 return {worker,root,escrow,client,verifier,recipient,call,fund,result,accept,order,balance,accounting,actor};
}
function conserved(a){assert.equal(BigInt(a.funded),BigInt(a.escrow)+BigInt(a.available_credits)+BigInt(a.pending_transfers)+BigInt(a.paid)+BigInt(a.refunded));}
test('Sandbox blocks anonymous capacity griefing; admission revocation cannot trap existing funds',{timeout:180000},async t=>{
 const x=await setup(t),args=await x.fund('owned');
 const before=await x.accounting();
 for(let i=0;i<3;i++)await assert.rejects(()=>x.call(x.root,'create_work_order',{...args,order_id:'spam-'+i},NEAR),/client admission required/);
 await assert.rejects(()=>x.call(x.root,'set_client_admission',{client:x.root.accountId,allowed:true}),/private/i);
 assert.deepEqual(await x.accounting(),before);
 await x.call(x.escrow,'set_client_admission',{client:x.client.accountId,allowed:false});
 await assert.rejects(()=>x.fund('revoked'),/client admission required/);
 await x.result('owned','extract',false);
 assert.equal(await x.call(x.client,'claim_refund',{order_id:'owned'}),true);
 assert.equal((await x.order('owned')).refunded,true);
 conserved(await x.accounting());
});
async function settled(getter){for(let i=0;i<100;i++){const value=await getter();if(value.pending===null&&value.refund_pending===undefined)return value;if(value.refund_pending===null)return value;await new Promise(r=>setTimeout(r,100));}throw new Error('transfer callback did not settle');}

test('Sandbox rejects unauthorized calls, wrong funding, duplicate orders and early dependent results',{timeout:180000},async t=>{
 const x=await setup(t),args=await x.fund();
 await assert.rejects(()=>x.call(x.client,'create_work_order',{...args,order_id:'wrong'},NEAR-1n),/deposit must equal/);
 await assert.rejects(()=>x.call(x.client,'create_work_order',args,NEAR),/duplicate order/);
 await assert.rejects(()=>x.call(x.client,'record_subtask_result',{order_id:'order',task_id:'extract',accepted:true,report_hash:hash,artifact_hash:hash}),/verifier only/);
 await assert.rejects(()=>x.result('order','compare'),/predecessor not accepted/);
 await assert.rejects(()=>x.call(x.client,'on_withdrawal',{recipient:x.recipient.accountId,operation:'1'}),/private/i);
 await assert.rejects(()=>x.call(x.client,'on_refund',{order_id:'order',operation:'1'}),/private/i);
 await assert.rejects(()=>x.escrow.call(x.escrow,'new',{}),/initialized/i);
 conserved(await x.accounting());
});
test('Sandbox success credits once and a real withdrawal consumes credit',{timeout:180000},async t=>{
 const x=await setup(t);await x.fund();await x.accept('order');
 await x.call(x.root,'finalize_success',{order_id:'order'});
 assert.equal((await x.balance(x.recipient)).available,NEAR.toString());
 assert.equal(await x.call(x.recipient,'withdraw_claimable'),true);
 assert.deepEqual(await x.balance(x.recipient),{available:'0',pending:null});
 await assert.rejects(()=>x.call(x.recipient,'withdraw_claimable'),/no available credit/);
 await assert.rejects(()=>x.call(x.root,'finalize_success',{order_id:'order'}),/terminal order/);
 await assert.rejects(()=>x.call(x.client,'claim_refund',{order_id:'order'}),/refund not eligible/);
 const a=await x.accounting();conserved(a);assert.equal(a.paid,NEAR.toString());assert.equal(a.refunded,'0');
});
test('Sandbox final rejection blocks success and enables exactly one real client refund',{timeout:180000},async t=>{
 const x=await setup(t);await x.fund();await x.result('order','extract',false);
 await assert.rejects(()=>x.result('order','compare'),/terminal order/);
 await assert.rejects(()=>x.call(x.root,'finalize_success',{order_id:'order'}),/terminal order/);
 await assert.rejects(()=>x.call(x.root,'claim_refund',{order_id:'order'}),/client only/);
 assert.equal(await x.call(x.client,'claim_refund',{order_id:'order'}),true);
 await assert.rejects(()=>x.call(x.client,'claim_refund',{order_id:'order'}),/already paid or pending/);
 const a=await x.accounting();conserved(a);assert.equal(a.refunded,NEAR.toString());assert.equal(a.paid,'0');
});
test('Sandbox expires an incomplete order but permits late finalization of prior accepted work',{timeout:180000},async t=>{
 const x=await setup(t);await x.fund('incomplete',x.client,x.recipient,30);await x.fund('accepted',x.client,x.recipient,30);await x.accept('accepted');
 await x.worker.provider.fastForward(200);
 await x.call(x.root,'mark_expired',{order_id:'incomplete'});
 await assert.rejects(()=>x.result('incomplete','extract'),/terminal order|cutoff/);
 await assert.rejects(()=>x.call(x.root,'mark_expired',{order_id:'accepted'}),/accepted order cannot expire/);
 await x.call(x.root,'finalize_success',{order_id:'accepted'});
 await x.call(x.client,'claim_refund',{order_id:'incomplete'});conserved(await x.accounting());
});
test('Sandbox new credits arriving before withdrawal callback remain available',{timeout:180000},async t=>{
 const x=await setup(t),actor=await x.actor();
 await x.fund('first',x.client,actor);await x.accept('first');await x.call(x.root,'finalize_success',{order_id:'first'});
 await x.fund('second',x.client,actor);await x.accept('second');
 await actor.call(actor,'withdraw_then_finalize',{escrow:x.escrow.accountId,order_id:'second'},{gas:250n*10n**12n});
 const b=await settled(()=>x.balance(actor));assert.equal(b.available,NEAR.toString());
 let a=await x.accounting();conserved(a);assert.equal(a.paid,NEAR.toString());
 await x.call(actor,'withdraw_claimable');a=await x.accounting();conserved(a);assert.equal(a.paid,(2n*NEAR).toString());
});
test('Sandbox failed native withdrawal restores credit and can be retried after account recreation',{timeout:180000},async t=>{
 const x=await setup(t),actor=await x.actor();await x.fund('order',x.client,actor);await x.accept('order');await x.call(x.root,'finalize_success',{order_id:'order'});
 // Disclosed failure injection: the test actor requests withdrawal then deletes itself.
 await actor.callRaw(actor,'withdraw_then_delete',{escrow:x.escrow.accountId,beneficiary:x.root.accountId},{gas:250n*10n**12n});
 assert.equal(await actor.exists(),false);const b=await settled(()=>x.balance(actor));assert.equal(b.available,NEAR.toString());
 const recreated=await x.root.createSubAccount('actor',{initialBalance:5n*NEAR});
 assert.equal(await x.call(recreated,'withdraw_claimable'),true);conserved(await x.accounting());
});
test('Sandbox failed native refund restores eligibility and retry succeeds',{timeout:180000},async t=>{
 const x=await setup(t),actor=await x.actor();await x.fund('order',actor);await x.result('order','extract',false);
 await actor.callRaw(actor,'refund_then_delete',{escrow:x.escrow.accountId,beneficiary:x.root.accountId,order_id:'order'},{gas:250n*10n**12n});
 assert.equal(await actor.exists(),false);const o=await settled(()=>x.order('order'));assert.equal(o.refunded,false);
 const recreated=await x.root.createSubAccount('actor',{initialBalance:5n*NEAR});
 assert.equal(await x.call(recreated,'claim_refund',{order_id:'order'}),true);const a=await x.accounting();conserved(a);assert.equal(a.refunded,NEAR.toString());
});

test('Sandbox storage reserve failure rolls back principal and order writes',{timeout:180000},async t=>{
 const x=await setup(t);
 const args=await x.fund('reference');
 const poor=await x.root.devDeploy(wasm,{initialBalance:50n*NEAR});
 await poor.call(poor,'new',{}, {gas:GAS});
 await poor.call(poor,'set_client_admission',{client:x.client.accountId,allowed:true},{gas:GAS});
 // Disclosed Sandbox-only fixture: reduce only the operator's unencumbered balance
 // after initialization; preserve code, storage metadata and zero-liability state.
 const view=await poor.accountView();
 const reserve=1376256n*10n**19n;
 await poor.updateAccount({...view,amount:(reserve+NEAR/100n).toString()});
 const command={...args,order_id:'reserve-check'};
 await assert.rejects(()=>x.client.call(poor,'create_work_order',command,{gas:GAS,attachedDeposit:NEAR}),/reserve insufficient/);
 const a=await poor.view('get_accounting',{});assert.equal(a.funded,'0');assert.equal(a.order_count,'0');conserved(a);
 await assert.rejects(()=>poor.view('get_order',{order_id:'reserve-check'}),/unknown order/);
 await x.root.call(poor,'fund_storage',{}, {gas:GAS,attachedDeposit:NEAR});
 await x.client.call(poor,'create_work_order',command,{gas:GAS,attachedDeposit:NEAR});
 const recovered=await poor.view('get_accounting',{});assert.equal(recovered.funded,NEAR.toString());assert.equal(recovered.order_count,'1');conserved(recovered);
});

test('Sandbox rejects malformed allocation graphs without increasing liabilities',{timeout:180000},async t=>{
 const x=await setup(t),args=await x.fund('reference');
 for(const [name,mutate,reason] of [
  ['duplicate',a=>{a.tasks[1].id='extract';a.tasks[1].depends_on=[];},/duplicate task/],
  ['cycle',a=>{a.tasks[0].depends_on=['compare'];},/dependency cycle/],
  ['no-edge',a=>{a.tasks[1].depends_on=[];},/dependency required/],
  ['bad-hash',a=>{a.agreement_hash='sha256:bad';},/invalid agreement hash/]
 ]){
  const command=structuredClone(args);command.order_id=name;mutate(command);
  await assert.rejects(()=>x.call(x.client,'create_work_order',command,NEAR),reason);
 }
 const a=await x.accounting();assert.equal(a.order_count,'1');assert.equal(a.funded,NEAR.toString());conserved(a);
});

const teeCode='bb9fa85b135deb155f187f9ea49df8c907f90b885a88b90459f5bed208122051';
async function teeFixture(x,id='tee-order',seconds=3600){
 const vectors=judgeConformanceVectors('sha256:'+teeCode);
 const verification=structuredClone(vectors[0].input.verification),a=verification.agreement;
 const block=await x.worker.provider.block({finality:'final'});
 Object.assign(a,{orderId:id,contractId:x.escrow.accountId,clientAccountId:x.client.accountId,verifierAccountId:x.verifier.accountId,totalAmountAtomic:NEAR.toString(),resultCutoffNs:(BigInt(block.header.timestamp_nanosec)+BigInt(seconds)*1000000000n).toString()});
 a.tasks.forEach((task,i)=>{task.recipientAccountId=x.recipient.accountId;task.amountAtomic=(NEAR*BigInt(i?6:4)/10n).toString();});
 verification.approvedAgreementHash=hashValue(a);
 const compare=structuredClone(vectors[4].input.verification);compare.agreement=a;compare.approvedAgreementHash=hashValue(a);
 const fund=()=>x.call(x.client,'create_tee_work_order',{agreement_json:canonicalJson(a)},NEAR);
 const prepare=(v=verification,who=x.verifier)=>x.call(who,'prepare_tee_request',{order_id:id,task_id:v.taskId,verification_json:canonicalJson(v)});
 const state=()=>x.escrow.view('get_tee_state',{order_id:id});
 return {id,a,verification,compare,fund,prepare,state};
}

test('Sandbox TEE funding freezes profile and old verifier cannot accept or reject work',{timeout:180000},async t=>{
 const x=await setup(t),f=await teeFixture(x);await f.fund();
 const initial=await f.state();assert.equal(initial.verification_mode,'outlayer-tdx-direct-v1');
 assert.equal(initial.code_hash,teeCode);assert.equal(initial.state.agreement_json,canonicalJson(f.a));
 for(const accepted of [true,false])await assert.rejects(()=>x.result(f.id,'extract',accepted),/TEE mode.*cannot record/);
 await assert.rejects(()=>x.call(x.client,'create_tee_work_order',{agreement_json:canonicalJson(f.a)},NEAR),/duplicate order/);
 await assert.rejects(()=>x.call(x.client,'create_work_order',{order_id:f.id,agreement_hash:hash,verifier:x.verifier.accountId,cutoff_ns:f.a.resultCutoffNs,tasks:[{id:'extract',recipient:x.recipient.accountId,amount:(NEAR*4n/10n).toString(),depends_on:[]},{id:'compare',recipient:x.recipient.accountId,amount:(NEAR*6n/10n).toString(),depends_on:['extract']}]},NEAR),/duplicate order/);
 assert.deepEqual(await f.state(),initial);
 await assert.rejects(()=>x.call(x.root,'finalize_success',{order_id:f.id}),/required results missing/);
 assert.equal((await x.balance(x.recipient)).available,'0');conserved(await x.accounting());
});

test('Sandbox TEE preparation rejects substituted agreement, policy, sources, dependencies and revisions',{timeout:180000},async t=>{
 const x=await setup(t),f=await teeFixture(x);await f.fund();const before=await f.state();
 await assert.rejects(()=>f.prepare(f.verification,x.client),/verifier only/);
 await assert.rejects(()=>f.prepare(f.compare),/predecessor not accepted/);
 for(const [mutate,reason] of [
  [v=>{v.agreement.orderId='other-order';},/agreement or task mismatch/],
  [v=>{v.agreement.contractId='elsewhere.testnet';},/agreement or task mismatch/],
  [v=>{v.approvedAgreementHash=hash;},/agreement or task mismatch/],
  [v=>{v.policy.constraints.budgetMinor='999999';},/frozen policy mismatch/],
  [v=>{v.sources[0].text='substituted';},/frozen sources mismatch/],
  [v=>{v.revision=1;},/stale artifact revision/],
  [v=>{v.acceptedDependencies=[{taskId:'compare'}];},/dependency count mismatch/]
 ]) {const v=structuredClone(f.verification);mutate(v);await assert.rejects(()=>f.prepare(v),reason);assert.deepEqual(await f.state(),before);}
 const duplicate=canonicalJson(f.verification).replace('"revision":0','"revision":0,"revision":0');
 await assert.rejects(()=>x.call(x.verifier,'prepare_tee_request',{order_id:f.id,task_id:'extract',verification_json:duplicate}),/canonical TEE JSON/);
 assert.deepEqual(await f.state(),before);conserved(await x.accounting());
});

test('Sandbox TEE request commits chain-generated context and rejects consistently rehashed forged acceptance',{timeout:240000},async t=>{
 const x=await setup(t),f=await teeFixture(x);await f.fund();
 const request=await f.prepare(),s=await f.state(),pending=s.state.progress[0].pending;
 assert.equal(hashBytes(request.input_data),'sha256:'+pending.input_hash);
 const wrapper=JSON.parse(request.input_data),inner=JSON.parse(wrapper.inputBytes);
 assert.equal(hashBytes(wrapper.inputBytes),pending.inner_hash);
 assert.equal(inner.requestId,pending.request_id);assert.equal(inner.verification.evaluatedAtNs,pending.prepared_at_ns);
 assert.equal(inner.verification.approvedAgreementHash,hashValue(f.a));
 await assert.rejects(()=>f.prepare(),/already pending/);
 await assert.rejects(()=>x.result(f.id,'extract'),/TEE mode.*cannot record/);
 const original=JSON.parse((await readFile(new URL('../fixtures/tee/extract.proof.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 const stdout=JSON.parse(original.output_raw),guest=JSON.parse(stdout),r=guest.result;
 Object.assign(r,{requestId:pending.request_id,inputHash:pending.inner_hash});
 Object.assign(r.verification,{orderId:f.id,agreementHash:hashValue(f.a),policyHash:pending.policy_hash,artifactHash:pending.artifact_hash,sourceManifestHash:f.a.sourceManifestHash,artifactVersion:1});
 guest.outputHash=hashValue(r);
 const output_data=JSON.stringify(canonicalJson(guest)+'\n');
 const proof={task_id:original.attestation.task_id,block_height:String(original.attestation.block_height),timestamp:(BigInt(pending.prepared_at_ns)/1000000000n).toString(),caller_account_id:x.verifier.accountId,wasm_hash:teeCode,input_hash:pending.input_hash,output_hash:hashBytes(output_data).slice(7),quote:original.attestation.tdx_quote};
 const args={order_id:f.id,task_id:'extract',proof,collateral:original.collateral,output_data};
 const submit=a=>x.root.call(x.escrow,'submit_tee_result',a,{gas:300n*10n**12n});
 await assert.rejects(()=>submit(args),/quote execution commitment mismatch/);
 for(const [mutate,reason] of [
  [a=>{a.proof.wasm_hash='0'.repeat(64);},/wrong code or execution input/],
  [a=>{a.proof.input_hash='0'.repeat(64);},/wrong code or execution input/],
  [a=>{a.proof.caller_account_id=x.root.accountId;},/wrong attested caller/],
  [a=>{a.proof.timestamp='1';},/stale or future/],
  [a=>{a.output_data+=' ';},/attested output mismatch/],
  [a=>{a.collateral+=' ';},/unapproved collateral/],
  [a=>{a.task_id='compare';},/no pending TEE request/]
 ]){const changed=structuredClone(args);mutate(changed);await assert.rejects(()=>submit(changed),reason);assert.deepEqual(await f.state(),s);}
 assert.equal((await x.order(f.id)).status,'Open');assert.equal((await x.balance(x.recipient)).available,'0');conserved(await x.accounting());
});

test('Sandbox missing TEE evidence expires to full refund without any partial worker payment',{timeout:180000},async t=>{
 const x=await setup(t),f=await teeFixture(x,'tee-expiry',30);await f.fund();await f.prepare();
 await x.worker.provider.fastForward(200);
 await assert.rejects(()=>f.prepare(),/cutoff/);
 await x.call(x.root,'mark_expired',{order_id:f.id});
 await assert.rejects(()=>x.result(f.id,'extract'),/TEE mode.*cannot record/);
 await assert.rejects(()=>x.call(x.root,'finalize_success',{order_id:f.id}),/terminal order/);
 await x.call(x.escrow,'set_client_admission',{client:x.client.accountId,allowed:false});
 assert.equal(await x.call(x.client,'claim_refund',{order_id:f.id}),true);
 await assert.rejects(()=>x.call(x.client,'claim_refund',{order_id:f.id}),/already paid or pending/);
 const a=await x.accounting();conserved(a);assert.equal(a.refunded,NEAR.toString());assert.equal(a.paid,'0');assert.equal((await x.balance(x.recipient)).available,'0');
});

test('Sandbox malformed TEE funding rolls back every agreement and principal write',{timeout:180000},async t=>{
 const x=await setup(t),f=await teeFixture(x);
 for(const [mutate,reason] of [
  [a=>{a.network='mainnet';},/unsupported TEE economic profile/],
  [a=>{a.contractId='different.testnet';},/wrong agreement contract/],
  [a=>{a.clientAccountId=x.root.accountId;},/wrong agreement client/],
  [a=>{a.totalAmountAtomic='1';},/agreement principal mismatch/],
  [a=>{a.resultCutoffNs='0'+a.resultCutoffNs;},/noncanonical agreement cutoff/],
  [a=>{a.resultCutoffNs='1796688919000000000';},/pinned collateral window/],
  [a=>{a.tasks[0].amountAtomic='0'+a.tasks[0].amountAtomic;},/noncanonical agreement allocation/],
  [a=>{a.tasks[0].verificationPolicyHash='sha256:bad';},/invalid frozen policy/],
  [a=>{a.tasks[0].dependsOn=['compare'];},/dependency cycle/]
 ]){const a=structuredClone(f.a);mutate(a);await assert.rejects(()=>x.call(x.client,'create_tee_work_order',{agreement_json:canonicalJson(a)},NEAR),reason);assert.equal((await x.accounting()).funded,'0');}
 await f.fund();assert.equal((await x.accounting()).funded,NEAR.toString());conserved(await x.accounting());
});

test('Sandbox lean deployment preserves storage and principal with 14.25 NEAR operator funding',{timeout:240000},async t=>{
 const x=await setup(t);
 const lean=await x.root.devDeploy(wasm,{initialBalance:NEAR*1425n/100n});
 await lean.call(lean,'new',{}, {gas:GAS});
 await lean.call(lean,'set_client_admission',{client:x.client.accountId,allowed:true},{gas:GAS});
 const y={...x,escrow:lean,call:(who,method,args={},attachedDeposit=0n)=>who.call(lean,method,args,{gas:GAS,attachedDeposit})};
 const first=await teeFixture(y,'lean-first',45),second=await teeFixture(y,'lean-second',45);
 await first.fund();await second.fund();await first.prepare();
 const a=await lean.view('get_accounting',{});
 assert.equal(a.reserved_storage_bytes,String(1376256+2*16384));
 assert.equal(a.funded,(2n*NEAR).toString());conserved(a);
 const view=await lean.accountView();assert(BigInt(view.storage_usage)+4096n<=BigInt(a.reserved_storage_bytes));
 // An extra order must not borrow the two existing principals for its reserve.
 const third=await teeFixture(y,'lean-third',45);
 await assert.rejects(()=>third.fund(),/reserve insufficient/);
 assert.deepEqual(await lean.view('get_accounting',{}),a);
 await x.worker.provider.fastForward(300);
 for(const f of [first,second]){await y.call(x.root,'mark_expired',{order_id:f.id});assert.equal(await y.call(x.client,'claim_refund',{order_id:f.id}),true);}
 const final=await lean.view('get_accounting',{});conserved(final);
 assert.equal(final.refunded,(2n*NEAR).toString());assert.equal(final.paid,'0');
 assert.equal((await lean.view('get_balance',{account:x.recipient.accountId})).available,'0');
});

