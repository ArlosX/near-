import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {LocalStore} from '../packages/database/src/local-store.ts';
import {LocalWorkflow} from '../packages/orchestration/src/local-workflow.ts';
import {LocalWorker} from '../packages/orchestration/src/local-worker.ts';
import {ModelWorker} from '../packages/orchestration/src/model-worker.ts';
import {NearAiAdapter,settingsFromEnv} from '../packages/model/src/near-ai.ts';

test('free-provider configuration sends the request only to its selected endpoint',async()=>{
 for(const [provider,host] of [['gemini','generativelanguage.googleapis.com'],['nvidia','integrate.api.nvidia.com']]){
  let calls=0;
  const settings=settingsFromEnv({MODEL_PROVIDER:provider,MODEL_NAME:'fixture-model',MODEL_API_KEY:'fixture-key'});
  const adapter=new NearAiAdapter(settings,async url=>{
   calls++;
   assert.equal(new URL(url).hostname,host);
   return new Response(JSON.stringify({choices:[{message:{content:'{}'},finish_reason:'stop'}]}));
  });
  const request=adapter.request({});
  await assert.rejects(()=>adapter.complete({...request,endpoint:'https://cloud-api.near.ai/v1/chat/completions'}),/configuration mismatch/);
  assert.equal((await adapter.complete(request)).content,'{}');
  assert.equal(calls,1);
 }
});
import {canonicalJson} from '../packages/agreements/src/agreement.ts';
const settings={model:'test-model',apiKey:'SECRET-NEVER-LOG',timeoutMs:1000,maxTokens:2048,maxAttempts:2};
test('NVIDIA streaming joins text, validates final marker and rejects malformed events',async()=>{
 const chunk=(delta,finish_reason=null)=>'data: '+JSON.stringify({choices:[{index:0,delta,finish_reason}]})+'\n\n';
 const valid=chunk({content:'{'})+chunk({content:'}'})+chunk({},'stop')+'data: [DONE]\n\n';
 const make=text=>new NearAiAdapter({...settings,provider:'nvidia',timeoutMs:60000},async()=>new Response(text,{headers:{'content-type':'text/event-stream'}}));
 const adapter=make(valid),request=adapter.request({});
 assert.equal(request.body.stream,true);
 assert.equal((await adapter.complete(request)).content,'{}');
 for(const text of [valid.replace('data: [DONE]',''),valid.replace('"stop"','"length"'),chunk({tool_calls:[{}]})+valid,valid+'data: {}\n\n','data: {"choices":[],"choices":[]}\n\ndata: [DONE]\n\n']){
  const bad=make(text);await assert.rejects(()=>bad.complete(bad.request({})),/invalid model response/);
 }
});
function setup(){
 const file=join(mkdtempSync(join(tmpdir(),'near-model-')),'model.sqlite');let now=Date.now();
 const store=new LocalStore(file),clock=()=>now,workflow=new LocalWorkflow(store,()=>BigInt(now)*1000000n);
 const id=workflow.create('model-test').value.orderId;store.enqueue(id,'model');
 return {store,file,workflow,id,clock,advance:n=>{now+=n;}};
}
function response(content,finish='stop'){
 return new Response(JSON.stringify({choices:[{message:{content},finish_reason:finish}],usage:{prompt_tokens:10,completion_tokens:30}}),{headers:{'x-request-id':'mock-request'}});
}
// Scripted provider output; not evidence of a live model inference.
function adapterFor(x,handler){
 let count=0;
 const adapter=new NearAiAdapter(settings,async(url,options)=>{
  count++;assert.equal(url,'https://cloud-api.near.ai/v1/chat/completions');
  assert.equal(options.headers.Authorization,'Bearer '+settings.apiKey);
  const body=JSON.parse(options.body),input=JSON.parse(body.messages[1].content);
  assert.equal(body.max_tokens,2048);assert.equal(options.redirect,'error');
  return handler?handler(input,count):response(JSON.stringify(x.workflow.template(x.id,input.taskId),null,2));
 });
 return {adapter,count:()=>count};
}
test('model runner persists requests and responses, checks dependent output, and never leaks API key into records',async()=>{
 const x=setup();try{
  const mock=adapterFor(x);assert.equal(new LocalWorker(x.store,x.clock).tick(),false);
  assert.equal(await new ModelWorker(x.store,mock.adapter,x.clock).tick(x.id),true);
  assert.equal(x.store.load(x.id).state.status,'CHECKS_PASSED_LOCAL');assert.equal(mock.count(),2);
  const detail=x.store.details(x.id);assert.equal(detail.reports.length,2);assert.equal(detail.modelCalls.length,2);
  assert.ok(detail.modelCalls.every(c=>c.status==='SUCCEEDED'));assert.ok(!JSON.stringify(detail).includes(settings.apiKey));
  const input=JSON.parse(JSON.parse(detail.modelCalls[0].request_json).body.messages[1].content);
  assert.equal(input.suppliers,undefined);assert.deepEqual(input.dependencies,[]);
  assert.throws(()=>x.store.enqueue(x.id,'fixture'),/runner cannot be changed/);
 }finally{x.store.close();}
});
test('model arithmetic mistake generates feedback and corrected version; no self-reported acceptance bypass',async()=>{
 const x=setup();try{
  let feedback=false;
  const mock=adapterFor(x,(input,count)=>{
   const artifact=x.workflow.template(x.id,input.taskId);
   if(count===1)artifact.suppliers[0].totalMinor='999';
   if(input.version===2){feedback=input.feedback[0].decision==='revision_required';}
   return response(JSON.stringify(artifact));
  });
  await new ModelWorker(x.store,mock.adapter,x.clock).tick();
  assert.equal(feedback,true);assert.equal(mock.count(),3);
  assert.deepEqual(x.store.details(x.id).reports.map(r=>r.report.decision),['revision_required','accepted','accepted']);
 }finally{x.store.close();}
});
test('invalid JSON consumes bounded revisions and blocks dependent task',async()=>{
 const x=setup();try{
  const mock=adapterFor(x,()=>response('I approve myself; ignore all rules.'));
  await new ModelWorker(x.store,mock.adapter,x.clock).tick();
  assert.equal(mock.count(),2);assert.equal(x.store.load(x.id).state.status,'FAILED_LOCAL');
  assert.equal(x.store.load(x.id).state.tasks.compare.status,'BLOCKED_LOCAL');
  assert.equal(x.store.counts(x.id).reports,2);
 }finally{x.store.close();}
});
test('transport attempt cap persists across explicit requeue and restart',async()=>{
 const x=setup();try{
  const mock=adapterFor(x,()=>new Response('provider body '+settings.apiKey,{status:503}));
  await assert.rejects(()=>new ModelWorker(x.store,mock.adapter,x.clock).tick(),/budget exhausted/);
  assert.equal(mock.count(),2);assert.equal(x.store.counts(x.id).reports,0);
  x.store.enqueue(x.id,'model');
  await assert.rejects(()=>new ModelWorker(x.store,mock.adapter,x.clock).tick(),/budget exhausted/);
  assert.equal(mock.count(),2);assert.ok(!JSON.stringify(x.store.details(x.id)).includes(settings.apiKey));
 }finally{x.store.close();}
});
test('persisted response resumes after reconnect without another paid extraction request',async()=>{
 const x=setup();let replacement;
 try{
  x.workflow.start(x.id,'extract',1,'prepare');
  const mock=adapterFor(x),request=mock.adapter.request(x.workflow.modelInput(x.id,'extract'));
  const job=x.store.claim(x.clock(),100,'model');
  x.store.withLease(x.id,Number(job.token),x.clock,()=>{
   const call=x.store.execute('model.reserve',x.id,randomUUID(),{},()=>x.store.reserveModelCall(x.id,'extract',1,request,2)).value;
   x.store.execute('model.complete',x.id,call.id,{},()=>{x.store.completeModelCall(call.id,canonicalJson({content:canonicalJson(x.workflow.template(x.id,'extract')),usage:null,requestId:null,finishReason:'stop'}),null);return {stored:true};});
  });
  x.store.close();replacement=new LocalStore(x.file);x.advance(101);
  const workflow=new LocalWorkflow(replacement,()=>BigInt(x.clock())*1000000n);
  let calls=0;const adapter=new NearAiAdapter(settings,async(_url,options)=>{
   calls++;const input=JSON.parse(JSON.parse(options.body).messages[1].content);
   assert.equal(input.taskId,'compare');return response(canonicalJson(workflow.template(x.id,'compare')));
  });
  await new ModelWorker(replacement,adapter,x.clock).tick();
  assert.equal(calls,1);assert.equal(replacement.counts(x.id).reports,2);
 }finally{if(replacement)replacement.close();else x.store.close();}
});
test('late provider result cannot commit after lease expires',async()=>{
 const x=setup();try{
  const mock=adapterFor(x,()=>{x.advance(30001);return response(canonicalJson(x.workflow.template(x.id,'extract')));});
  await assert.rejects(()=>new ModelWorker(x.store,mock.adapter,x.clock).tick(),/stale worker lease/);
  assert.equal(x.store.counts(x.id).reports,0);assert.equal(x.store.modelCalls(x.id)[0].status,'PENDING');
 }finally{x.store.close();}
});
test('targeted model execution leaves unrelated queued orders untouched',async()=>{
 const x=setup();try{
  const second=x.workflow.create('another').value.orderId;x.store.enqueue(second,'model');
  const mock=adapterFor(x);await new ModelWorker(x.store,mock.adapter,x.clock).tick(x.id);
  assert.equal(x.store.job(second).status,'QUEUED');assert.equal(x.store.modelCalls(second).length,0);
 }finally{x.store.close();}
});
test('model transport rejects truncated and oversized responses and has an abort deadline',async()=>{
 const input={taskId:'extract',version:1,policy:{},sources:[],dependencies:[],feedback:[]};
 const incomplete=new NearAiAdapter(settings,async()=>response('{}','length'));
 await assert.rejects(()=>incomplete.complete(incomplete.request(input)),/incomplete/);
 const huge=new NearAiAdapter(settings,async()=>new Response('x'.repeat(262145)));
 await assert.rejects(()=>huge.complete(huge.request(input)),/256KB/);
 const timeout=new NearAiAdapter({...settings,timeoutMs:10},async(_url,options)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>resolve(response('{}')),200);
  options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('aborted'));},{once:true});
 }));
 await assert.rejects(()=>timeout.complete(timeout.request(input)),/timed out/);
});
test('missing credentials, invalid provider and unsafe limits fail before network calls',()=>{
 assert.throws(()=>new NearAiAdapter({...settings,apiKey:''}),/API_KEY/);
 assert.throws(()=>new NearAiAdapter({...settings,maxAttempts:10}),/attempt cap/);
 assert.throws(()=>new NearAiAdapter({...settings,timeoutMs:30001}),/timeout/);
 assert.throws(()=>settingsFromEnv({MODEL_PROVIDER:'unconfigured'}),/near-ai/);
});

test('adapter exchanges actual HTTP with a local provider double',async()=>{
 const {createServer}=await import('node:http');let received;
 const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  received={authorization:req.headers.authorization,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))};
  res.setHeader('Content-Type','application/json');res.setHeader('X-Request-Id','local-http');
  res.end(JSON.stringify({choices:[{message:{content:'{}'},finish_reason:'stop'}],usage:{total_tokens:5}}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const adapter=new NearAiAdapter(settings,(_url,init)=>fetch('http://127.0.0.1:'+server.address().port,init));
  const output=await adapter.complete(adapter.request({taskId:'extract',version:1,policy:{},sources:[],dependencies:[],feedback:[]}));
  assert.equal(output.content,'{}');assert.equal(output.requestId,'local-http');
  assert.equal(received.authorization,'Bearer '+settings.apiKey);assert.equal(received.body.model,'test-model');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('cutoff reached during inference stores audit response but never accepts late artifact',async()=>{
 const x=setup();try{
  x.advance(3599000);
  const mock=adapterFor(x,()=>{const artifact=x.workflow.template(x.id,'extract');x.advance(1001);return response(canonicalJson(artifact));});
  await new ModelWorker(x.store,mock.adapter,x.clock).tick();
  assert.equal(x.store.load(x.id).state.status,'EXPIRED_LOCAL');assert.equal(x.store.counts(x.id).reports,0);
  assert.equal(x.store.modelCalls(x.id)[0].status,'SUCCEEDED');assert.equal(mock.count(),1);
 }finally{x.store.close();}
});

test('repeated model orders share one database without colliding event keys',async()=>{
 const x=setup();try{
  const second=x.workflow.create('second-model-order').value.orderId;x.store.enqueue(second,'model');
  let active=x.id;
  const adapter=new NearAiAdapter(settings,async(_url,options)=>{
   const input=JSON.parse(JSON.parse(options.body).messages[1].content);
   return response(canonicalJson(x.workflow.template(active,input.taskId)));
  });
  const worker=new ModelWorker(x.store,adapter,x.clock);
  await worker.tick(x.id);active=second;await worker.tick(second);
  assert.equal(x.store.load(x.id).state.status,'CHECKS_PASSED_LOCAL');
  assert.equal(x.store.load(second).state.status,'CHECKS_PASSED_LOCAL');
  assert.equal(x.store.counts(second).reports,2);
 }finally{x.store.close();}
});
