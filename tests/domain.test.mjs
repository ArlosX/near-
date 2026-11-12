import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,hash,validateAgreement,fundingIntent} from '../packages/agreements/src/agreement.ts';
import {atomic,U128_MAX} from '../packages/shared/src/domain.ts';
import {transition,parentOutcome,allocationScore} from '../packages/orchestration/src/workflow.ts';
import {verifySupplier,eligible,verifyDependency} from '../packages/verification/src/verify.ts';
const h='sha256:'+'a'.repeat(64);
const task=(id,deps,amount)=>({id,dependsOn:deps,amountAtomic:amount,agentId:id+'-worker',runtimeVersion:'v1',recipientAccountId:id+'.testnet',required:true,maxRevisions:1,verificationPolicyHash:h,criteria:[{id:'evidence',checker:'source_quote',version:1}]});
const agreement=()=>({schemaVersion:'1.2',network:'testnet',contractId:'escrow.testnet',orderId:'order-1',clientAccountId:'client.testnet',verifierAccountId:'verifier.testnet',asset:'NEAR',totalAmountAtomic:'100',resultCutoffNs:'1000',sourceManifestHash:h,settlement:'full_parent_success',failure:'full_client_refund',tasks:[task('extract',[],'40'),task('compare',['extract'],'60')]});
test('snapshot isolates caller mutation and funding matches approved data',()=>{
 const input=agreement(),a=validateAgreement(input,0n);input.tasks[0].recipientAccountId='other.testnet';
 const i=fundingIntent(a);assert.equal(i.args.agreement_hash,hash(a));assert.equal(i.depositAtomic,'100');assert.equal(i.args.tasks[0].recipient,'extract.testnet');assert.equal(i.signerId,'client.testnet');assert.deepEqual(i.args.tasks[1].depends_on,['extract']);assert.equal(i.args.verifier,'verifier.testnet');assert.equal(i.args.cutoff_ns,a.resultCutoffNs);
});
test('canonical hash stable across key order, sensitive to content',()=>{
 assert.equal(hash({b:1,a:'x'}),hash({a:'x',b:1}));assert.notEqual(hash({a:1}),hash({a:2}));
 for(const v of [undefined,NaN,Infinity,1.5,-0,1n,new Date(),{a:undefined},new Array(2)])assert.throws(()=>canonicalJson(v));
});
test('money rejects noncanonical integers and overflow',()=>{
 for(const v of [1,'01','-1','1.0','1e3',(U128_MAX+1n).toString()])assert.throws(()=>atomic(v,'money'));
 assert.equal(atomic(U128_MAX.toString(),'money'),U128_MAX);
});
test('rejects budget, graph, account and checker corruption',()=>{
 const mutations=[a=>a.tasks[0].amountAtomic='41',a=>a.tasks[0].dependsOn=['compare'],a=>a.tasks[1].dependsOn=['missing'],a=>a.tasks[1].dependsOn=['compare'],a=>a.tasks[1].id='extract',a=>a.tasks[0].required=false,a=>a.tasks[0].recipientAccountId='Bad account',a=>a.tasks[0].criteria[0].checker='shell',a=>a.extra=true,a=>a.resultCutoffNs=(1n<<64n).toString()];
 for(const mutate of mutations){const a=agreement();mutate(a);assert.throws(()=>validateAgreement(a,0n));}
 assert.throws(()=>validateAgreement(agreement(),1000n));
});
test('revision respects dependency, artifact binding, cap and terminal state',()=>{
 let r={status:'PENDING',revisions:0,maxRevisions:1,artifactHash:null};
 assert.throws(()=>transition(r,{type:'start',dependenciesAccepted:false},1n,100n));
 r=transition(r,{type:'start',dependenciesAccepted:true},1n,100n);r=transition(r,{type:'submit',artifactHash:h},2n,100n);r=transition(r,{type:'revise'},3n,100n);
 r=transition(r,{type:'start',dependenciesAccepted:true},4n,100n);r=transition(r,{type:'submit',artifactHash:h},5n,100n);
 assert.throws(()=>transition(r,{type:'revise'},6n,100n));assert.throws(()=>transition(r,{type:'accept',artifactHash:'wrong'},6n,100n));
 r=transition(r,{type:'accept',artifactHash:h},7n,100n);assert.throws(()=>transition(r,{type:'reject'},8n,100n));
});
test('cutoff rejects new results, preserves accepted success eligibility',()=>{
 assert.equal(parentOutcome(['accepted','accepted'],200n,100n),'SUCCESS_ELIGIBLE');assert.equal(parentOutcome(['accepted',null],100n,100n),'EXPIRED');assert.equal(parentOutcome(['rejected',null],1n,100n),'FAILED');
 assert.throws(()=>transition({status:'PENDING',revisions:0,maxRevisions:1,artifactHash:null},{type:'start',dependenciesAccepted:true},100n,100n));
});
test('checks reject arithmetic errors, unknown delivery, blank evidence and wrong currency',()=>{
 const sources=[{id:'s',text:'Price 1000'}],c={currency:'USD',quantity:2,budgetMinor:'2500',maxDeliveryDays:7};
 const s={id:'a',sourceId:'s',quote:'Price 1000',unitPriceMinor:'1000',quantity:2,shippingMinor:'100',currency:'USD',deliveryDays:3,totalMinor:'2100'};
 assert.equal(eligible(verifySupplier(s,sources,c)),true);
 for(const patch of [{totalMinor:'10'},{deliveryDays:null},{quote:''},{currency:'EUR'}])assert.equal(eligible(verifySupplier({...s,...patch},sources,c)),false);
 assert.equal(verifyDependency(h,'changed').passed,false);
});
test('allocation preserves exact approved formula',()=>{
 assert.equal(allocationScore({S:1,R:1,Q:1,C:1,D:1},{w1:1,w2:2,w3:3,w4:4,w5:5}),-3);
 assert.throws(()=>allocationScore({S:2,R:0,Q:0,C:0,D:0},{w1:1,w2:1,w3:1,w4:1,w5:1}));
});

test('approved snapshot is deeply immutable',()=>{const a=validateAgreement(agreement(),0n);assert.throws(()=>{a.tasks[0].recipientAccountId='other.testnet';},TypeError);assert.throws(()=>a.tasks[1].dependsOn.push('other'),TypeError);});
