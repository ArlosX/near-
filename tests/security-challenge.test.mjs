import test from 'node:test';
import assert from 'node:assert/strict';
import {account,atomic,digest,identifier} from '../packages/shared/src/domain.ts';
import {currency} from '../packages/verification/src/policy.ts';
import {hash,canonicalJson,validateAgreement} from '../packages/agreements/src/agreement.ts';
import {verifySubmission} from '../packages/verification/src/report.ts';
import {fixture,editArtifact} from './fixtures/verification.mjs';
import {NearAiAdapter} from '../packages/model/src/near-ai.ts';
import {LocalStore} from '../packages/database/src/local-store.ts';
import {LocalWorkflow} from '../packages/orchestration/src/local-workflow.ts';
import {WalletAuth} from '../apps/test-console/src/wallet-auth.ts';
import {walletProof} from './fixtures/wallet.mjs';

test('challenge: terminal line separators cannot alias identifiers, accounts, money, hashes or currency',()=>{
 for(const suffix of ['\n','\r','\r\n','\u2028','\u2029']){
  for(const [validate,value] of [[identifier,'extract'],[account,'alice.testnet'],[atomic,'100'],[digest,'sha256:'+'a'.repeat(64)],[currency,'USD']]){
   assert.throws(()=>validate(value+suffix,'challenge'),undefined,JSON.stringify(value+suffix));
  }
 }
});

test('challenge: a source with trailing line separators fails the exact frozen grammar',()=>{
 for(const suffix of ['\n','\r','\r\n','\u2028','\u2029']){
  const input=fixture();input.sources[0].text+=suffix;
  input.agreement.sourceManifestHash=hash(input.sources);input.approvedAgreementHash=hash(input.agreement);
  assert.notEqual(verifySubmission(input).report.decision,'accepted',JSON.stringify(suffix));
 }
});

test('challenge: JSON provider envelopes cannot mix text with tool calls, refusal or error',async()=>{
 const settings={provider:'gemini',model:'fixture',apiKey:'local-only',timeoutMs:1000,maxTokens:128,maxAttempts:1};
 for(const extra of [{tool_calls:[{id:'x',function:{name:'transfer'}}]},{function_call:{name:'transfer'}},{refusal:'refused'}]){
  const client=new NearAiAdapter(settings,async()=>Response.json({choices:[{message:{content:'{}',...extra},finish_reason:'stop'}]}));
  await assert.rejects(()=>client.complete(client.request({})),undefined,JSON.stringify(extra));
 }
 const client=new NearAiAdapter(settings,async()=>Response.json({error:{message:'failed'},choices:[{message:{content:'{}'},finish_reason:'stop'}]}));
 await assert.rejects(()=>client.complete(client.request({})));
});

test('challenge: 400 deterministic amount mutations cannot turn fabricated arithmetic into accepted work',()=>{
 let seed=0x50524f4f;
 for(let i=0;i<400;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const input=editArtifact(fixture(),a=>{const s=a.suppliers[i%2];const delta=BigInt(1+seed%100000);s.unitPriceMinor=(BigInt(s.unitPriceMinor)+delta).toString();s.totalMinor=(BigInt(s.unitPriceMinor)*BigInt(s.quantity)+BigInt(s.shippingMinor)).toString();});
  assert.notEqual(verifySubmission(input).report.decision,'accepted',`mutation ${i}`);
 }
});

test('challenge: replay storms preserve exactly one submission and terminal state',()=>{
 const store=new LocalStore(':memory:');let now=10n;const workflow=new LocalWorkflow(store,()=>now);
 try{
  const id=workflow.create('challenge').value.orderId;
  assert.throws(()=>workflow.start(id,'compare',1,'early'),/dependencies/);
  workflow.start(id,'extract',1,'start');
  const bytes=canonicalJson(workflow.template(id,'extract'));
  const first=workflow.submit(id,'extract',bytes,2,'submit');
  const counts=store.counts(id);
  for(let i=0;i<100;i++)assert.equal(workflow.submit(id,'extract',bytes,2,'submit').replayed,true);
  assert.deepEqual(store.counts(id),counts);
  assert.throws(()=>workflow.submit(id,'extract',bytes+' ',2,'submit'),/idempotency/);
  workflow.start(id,'compare',first.value.version,'compare-start');
  workflow.submit(id,'compare',canonicalJson(workflow.template(id,'compare')),4,'compare-submit');
  const terminal=store.load(id);
  for(let i=0;i<25;i++)assert.throws(()=>workflow.start(id,'extract',5,'restart-'+i),/terminal/);
  assert.deepEqual(store.load(id),terminal);
 }finally{store.close();}
});

test('challenge: lease expiry during a transaction rolls back the entire local step',()=>{
 let now=1,expireAtCommit=false;
 const store=new LocalStore(':memory:',()=>{if(expireAtCommit)now=101;});
 const workflow=new LocalWorkflow(store,()=>BigInt(now)*1000000n);
 try{
  const id=workflow.create('lease-challenge').value.orderId;store.enqueue(id);
  const lease=store.claim(now,100),before=store.load(id),counts=store.counts(id);
  expireAtCommit=true;
  assert.throws(()=>store.withLease(id,Number(lease.token),()=>now,()=>workflow.start(id,'extract',1,'expired-commit')),/stale worker lease/);
  assert.deepEqual(store.load(id),before);
  assert.deepEqual(store.counts(id),counts);
 }finally{store.close();}
});

test('challenge: all 4096 four-task directed graphs agree with an independent topological oracle',()=>{
 const edges=[];for(let a=0;a<4;a++)for(let b=0;b<4;b++)if(a!==b)edges.push([a,b]);
 for(let mask=0;mask<4096;mask++){
  const a=fixture().agreement;a.totalAmountAtomic='100';
  a.tasks=Array.from({length:4},(_,i)=>({...structuredClone(a.tasks[0]),id:'task-'+i,amountAtomic:'25',dependsOn:[]}));
  edges.forEach(([source,target],bit)=>{if(mask&(1<<bit))a.tasks[target].dependsOn.push('task-'+source);});
  const remaining=new Set(a.tasks.map(t=>t.id)),done=new Set();
  for(let pass=0;pass<4;pass++)for(const task of a.tasks)if(remaining.has(task.id)&&task.dependsOn.every(id=>done.has(id))){remaining.delete(task.id);done.add(task.id);}
  if(mask===0||remaining.size)assert.throws(()=>validateAgreement(a,10n),undefined,'graph '+mask);
  else {const approved=validateAgreement(a,10n);assert.equal(approved.tasks.length,4);assert(Object.isFrozen(approved.tasks[0].dependsOn));}
 }
});

test('challenge: streaming refuses mixed refusal and text while ordinary JSON still succeeds',async()=>{
 const settings={provider:'gemini',model:'fixture',apiKey:'local-only',timeoutMs:1000,maxTokens:128,maxAttempts:1};
 const stream='data: '+JSON.stringify({choices:[{index:0,delta:{content:'{}',refusal:'refused'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n';
 const bad=new NearAiAdapter(settings,async()=>new Response(stream,{headers:{'content-type':'text/event-stream'}}));
 await assert.rejects(()=>bad.complete(bad.request({})));
 const good=new NearAiAdapter(settings,async()=>Response.json({choices:[{message:{content:'{}',refusal:null},finish_reason:'stop'}]}));
 assert.equal((await good.complete(good.request({}))).content,'{}');
});

test('challenge: forty concurrent wallet checks cannot resurrect a logged-out session',async()=>{
 const origin='http://127.0.0.1:4318';let checks=0,resolveCheck,waiting=false;
 const auth=new WalletAuth(async()=>{checks++;return waiting?new Promise(resolve=>{resolveCheck=resolve;}):true;});
 const challenge=auth.issue(origin),session=await auth.login(origin,challenge.state,walletProof(challenge));
 waiting=true;
 const pending=Array.from({length:40},()=>auth.authorize(session.token,origin,true));
 assert.equal(checks,2,'concurrent revalidation should share one RPC check');
 auth.logout(session.token);resolveCheck(true);
 assert.deepEqual(await Promise.all(pending),Array(40).fill(null));
 assert.equal(auth.identity(session.token),null);
});
