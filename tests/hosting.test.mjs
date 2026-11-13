import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {hostingConfig,validatePublicOrigin} from '../apps/test-console/src/hosting.ts';
import {createConsoleServer} from '../apps/test-console/src/server.ts';
import {WalletAuth} from '../apps/test-console/src/wallet-auth.ts';
import {PostgresExecutionStore} from '../packages/database/src/postgres-execution-store.ts';
import {PostgresWorkflow} from '../packages/orchestration/src/postgres-workflow.ts';
import {intearSignInRequest} from '../apps/test-console/public/wallet-connector.js';
import {walletProof} from './fixtures/wallet.mjs';
const origin='https://prooflane-test.onrender.com';
test('hosting is loopback by default and requires a canonical trusted HTTPS origin',()=>{
 assert.deepEqual(hostingConfig({}),{host:'127.0.0.1',port:4318,publicOrigin:undefined});
 assert.deepEqual(hostingConfig({RENDER:'true',RENDER_EXTERNAL_URL:origin,PORT:'10000'}),{host:'0.0.0.0',port:10000,publicOrigin:origin});
 for(const value of ['http://example.com',origin+'/',origin+'/path','https://user@example.com','https://localhost','https://127.0.0.1','https://example.com:444'])assert.throws(()=>validatePublicOrigin(value));
 assert.throws(()=>hostingConfig({RENDER:'true'}));
 assert.throws(()=>hostingConfig({PORT:'NaN'}));
 assert.throws(()=>createConsoleServer({},undefined,undefined,{publicOrigin:origin}),/authentication/);
});
test('hosted proxy transport preserves secure wallet sessions and rejects forged origins',async()=>{
 const pool={query:async()=>{throw Error('Auth test must not query database');}};
 const store=new PostgresExecutionStore(pool),auth=new WalletAuth(async()=>true);
 const server=createConsoleServer(store,new PostgresWorkflow(store),auth,{publicOrigin:origin});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const call=(path,method='GET',data={},headers={})=>new Promise((resolve,reject)=>{
  const body=JSON.stringify(data),req=request({hostname:'127.0.0.1',port:server.address().port,path,method,headers:{host:new URL(origin).host,...(method==='POST'?{origin,'content-type':'application/json','x-local-console':'1'}:{}),...headers}},res=>{
   let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text,json:()=>JSON.parse(text)}));
  });req.on('error',reject);req.end(method==='POST'?body:undefined);
 });
 try{
  assert.equal((await call('/api/health')).status,200);
  assert.equal((await call('/api/health','GET',{}, {host:'evil.invalid','x-forwarded-host':new URL(origin).host})).status,400);
  assert.equal((await call('/api/orders')).status,401);
  assert.equal((await call('/api/auth/challenge','POST',{}, {origin:'https://evil.invalid'})).status,400);
  assert.equal((await call('/api/auth/challenge','POST',{}, {origin:''})).status,400);
  const issued=await call('/api/auth/challenge','POST',{}, {'x-forwarded-host':'evil.invalid','x-forwarded-proto':'http'});
  assert.equal(issued.status,200);assert.equal(issued.json().recipient,origin);
  assert.match(issued.headers['set-cookie'][0],/HttpOnly; SameSite=Strict.*; Secure/);
  assert.equal(issued.headers['strict-transport-security'],'max-age=31536000');
  const packet=await intearSignInRequest(issued.json(),origin);assert.equal(packet.data.networkId,'testnet');
  const signed=walletProof(issued.json());
  const login=await call('/api/auth/login','POST',signed,{cookie:issued.headers['set-cookie'][0].split(';')[0]});
  assert.equal(login.status,200);assert.equal(login.json().accountId,'alice.testnet');
  const cookie=login.headers['set-cookie'][0].split(';')[0];assert.match(login.headers['set-cookie'][0],/; Secure/);
  assert.equal((await call('/api/auth/session','GET',{}, {cookie})).json().accountId,'alice.testnet');
  assert.equal((await call('/api/auth/logout','POST',{}, {cookie})).status,200);
  assert.equal((await call('/api/auth/session','GET',{}, {cookie})).json().accountId,null);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
