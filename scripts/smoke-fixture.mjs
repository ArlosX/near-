import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const folder=await mkdtemp(join(tmpdir(),'agent-work-clean-'));
const env={...process.env,PORT:'0',LOCAL_DB_PATH:join(folder,'demo.sqlite')};
for(const key of Object.keys(env))if(/^(DATABASE_|SUPABASE_|GEMINI_|MODEL_|NEAR_|NVIDIA_)/.test(key))delete env[key];
const child=spawn(process.execPath,['apps/test-console/src/server.ts'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let logs='';child.stderr.on('data',chunk=>{logs+=chunk.toString();});
const timeout=setTimeout(()=>child.kill(),30000);
try{
 const base=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>reject(Error('Fixture server stopped: '+code)));child.stdout.on('data',chunk=>{logs+=chunk.toString();const match=/http:\/\/127\.0\.0\.1:\d+/.exec(logs);if(match)resolve(match[0]);});});
 const health=await(await fetch(base+'/api/health')).json();assert.equal(health.database,'sqlite');assert.equal(health.ai,false);
 for(const path of ['/','/demo','/app.js','/style.css','/fonts/space-grotesk-variable.ttf','/release-evidence.json','/wallet-connector.js?v=intear-proof-2'])assert.equal((await fetch(base+path)).status,200,path);
 const post=async(path,data)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Console':'1'},body:JSON.stringify(data)});const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value;};
 const created=await post('/api/orders',{requestId:randomUUID(),budgetMinor:'2500',lifetimeSeconds:3600}),id=created.value.orderId;
 for(const taskId of ['extract','compare']){
  let detail=await(await fetch(base+'/api/orders/'+id)).json();
  await post('/api/orders/'+id+'/start',{taskId,expectedVersion:detail.version,requestId:randomUUID()});
  const artifact=await(await fetch(base+'/api/orders/'+id+'/template?taskId='+taskId)).json();
  detail=await(await fetch(base+'/api/orders/'+id)).json();
  const {canonicalJson}=await import('../packages/agreements/src/agreement.ts');
  const result=await post('/api/orders/'+id+'/submit',{taskId,artifactBytes:canonicalJson(artifact),expectedVersion:detail.version,requestId:randomUUID()});assert.equal(result.value.decision,'accepted');
 }
 const detail=await(await fetch(base+'/api/orders/'+id)).json();assert.equal(detail.state.status,'CHECKS_PASSED_LOCAL');
 const evidence=await(await fetch(base+'/api/orders/'+id+'/evidence-package')).json();assert.ok(evidence);
 console.log(JSON.stringify({status:'PASS',environment:'no API keys or database service variables',assets:7,tasks:2,evidenceExport:true,financialMeaning:'fixture only; no payment'},null,2));
}finally{clearTimeout(timeout);child.kill();}
