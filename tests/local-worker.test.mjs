import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalStore} from '../packages/database/src/local-store.ts';
import {LocalWorkflow} from '../packages/orchestration/src/local-workflow.ts';
import {LocalWorker} from '../packages/orchestration/src/local-worker.ts';
import {canonicalJson} from '../packages/agreements/src/agreement.ts';

function setup(){
 const filename=join(mkdtempSync(join(tmpdir(),'near-worker-')),'test.sqlite');
 let now=Date.now();const clock=()=>now;
 const store=new LocalStore(filename),workflow=new LocalWorkflow(store,()=>BigInt(now)*1000000n);
 const id=workflow.create('worker-test').value.orderId;
 return {store,workflow,id,clock,filename,advance:ms=>{now+=ms;}};
}
test('durable queued work survives reconnect and produces exactly two reports',()=>{
 const x=setup();x.store.enqueue(x.id);x.store.close();
 const store=new LocalStore(x.filename);
 try{
  const worker=new LocalWorker(store,x.clock);assert.equal(worker.tick(),true);
  assert.equal(store.load(x.id).state.status,'CHECKS_PASSED_LOCAL');
  assert.equal(store.counts(x.id).reports,2);assert.equal(store.job(x.id).status,'DONE');
  store.enqueue(x.id);assert.equal(worker.tick(),false);assert.equal(store.counts(x.id).reports,2);
 }finally{store.close();}
});
test('expired lease recovery resumes committed submission without duplicates; stale worker is fenced',()=>{
 const x=setup(),other=new LocalStore(x.filename);
 try{
  x.store.enqueue(x.id);const first=x.store.claim(x.clock(),100);
  assert.equal(other.claim(x.clock()),undefined);
  x.store.withLease(x.id,Number(first.token),x.clock,()=>{
   x.workflow.start(x.id,'extract',1,'interrupted-start');
   x.workflow.submit(x.id,'extract',canonicalJson(x.workflow.template(x.id,'extract')),2,'interrupted-submit');
  });
  // Simulate process disappearance after commit, before acknowledgement.
  x.advance(101);assert.equal(new LocalWorker(other,x.clock).tick(),true);
  assert.equal(other.counts(x.id).reports,2);
  const counts=other.counts(x.id);
  assert.throws(()=>x.store.withLease(x.id,Number(first.token),x.clock,()=>x.workflow.start(x.id,'compare',3,'stale-start')),/stale worker lease/);
  assert.throws(()=>x.store.finishJob(x.id,Number(first.token),x.clock(),'FAILED'),/stale worker lease/);
  assert.deepEqual(other.counts(x.id),counts);assert.equal(other.job(x.id).status,'DONE');
 }finally{x.store.close();other.close();}
});
test('worker expires overdue order without generating reports',()=>{
 const x=setup();try{
  x.store.enqueue(x.id);x.advance(3600001);new LocalWorker(x.store,x.clock).tick();
  assert.equal(x.store.load(x.id).state.status,'EXPIRED_LOCAL');assert.equal(x.store.counts(x.id).reports,0);
 }finally{x.store.close();}
});
test('explicit requeue recovers transient failure from last committed step',()=>{
 const x=setup();try{
  x.store.enqueue(x.id);
  assert.throws(()=>new LocalWorker(x.store,x.clock).tick(()=>{throw new Error('injected failure');}),/injected failure/);
  assert.equal(x.store.job(x.id).status,'FAILED');assert.equal(x.store.load(x.id).version,2);
  x.store.enqueue(x.id);new LocalWorker(x.store,x.clock).tick();
  assert.equal(x.store.job(x.id).status,'DONE');assert.equal(x.store.counts(x.id).reports,2);
 }finally{x.store.close();}
});

test('multiple queued orders use independent event namespaces',()=>{
 const x=setup();try{
  const second=x.workflow.create('second-worker-order').value.orderId;
  x.store.enqueue(x.id);x.store.enqueue(second);
  const worker=new LocalWorker(x.store,x.clock);worker.tick();worker.tick();
  assert.equal(x.store.load(x.id).state.status,'CHECKS_PASSED_LOCAL');
  assert.equal(x.store.load(second).state.status,'CHECKS_PASSED_LOCAL');
  assert.equal(x.store.counts(second).reports,2);
 }finally{x.store.close();}
});
