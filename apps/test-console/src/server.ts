import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { LocalStore } from '../../../packages/database/src/local-store.ts';
import { LocalWorkflow } from '../../../packages/orchestration/src/local-workflow.ts';
import { exactKeys, identifier, invariant, record, ValidationError } from '../../../packages/shared/src/domain.ts';
import { LocalWorker } from '../../../packages/orchestration/src/local-worker.ts';
import {PostgresExecutionStore} from '../../../packages/database/src/postgres-execution-store.ts';
import {PostgresWorkflow} from '../../../packages/orchestration/src/postgres-workflow.ts';
import type {WalletAuth} from './wallet-auth.ts';
import {parseJsonStrict} from '../../../packages/shared/src/json.ts';
import {buildEvidencePackage} from '../../../packages/verification/src/evidence-package.ts';
const publicDirectory=fileURLToPath(new URL('../public/',import.meta.url));
export function createConsoleServer(store:LocalStore|PostgresExecutionStore,backend?:PostgresWorkflow,auth?:WalletAuth){
 invariant(!auth||backend&&store instanceof PostgresExecutionStore,'Wallet authentication requires an owner-scoped PostgreSQL backend');
 let active=0,tokens=180,lastRefill=Date.now(),authTokens=12,authRefill=Date.now();
 const server=createServer({maxHeaderSize:8192},(req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'");
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies','none');
  res.setHeader('Cache-Control','no-store');
  const now=Date.now();tokens=Math.min(180,tokens+(now-lastRefill)*3/1000);lastRefill=now;
  if(active>=16||tokens<1){res.writeHead(429,{'Content-Type':'application/json','Retry-After':'1','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Too many requests; retry shortly'}));return;}
  tokens--;active++;
  void handle(req,res).catch(error=>{
  const known=error instanceof ValidationError;
  if(!res.headersSent){res.writeHead(known?400:500,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:known?error.message:'Request failed; internal details withheld'}));}else res.end();
 }).finally(()=>{active--;});});
 async function handle(req:IncomingMessage,res:ServerResponse){
  const address=server.address();invariant(address&&typeof address==='object','server not listening');
  const host=req.headers.host;invariant(host==='127.0.0.1:'+address.port||host==='localhost:'+address.port,'invalid local host');
  const origin='http://'+host;invariant(!req.headers.origin||req.headers.origin===origin,'cross-origin request blocked');
  invariant(req.url?.startsWith('/')&&!req.url.startsWith('//'),'relative request target required');
  const url=new URL(req.url??'/',origin);
  if(url.pathname.startsWith('/api/'))invariant(!req.headers['sec-fetch-site']||['same-origin','none'].includes(String(req.headers['sec-fetch-site'])),'cross-site API request blocked');
  if(req.method==='POST'&&url.pathname.startsWith('/api/auth/')){
   const now=Date.now();authTokens=Math.min(12,authTokens+(now-authRefill)/5000);authRefill=now;
   if(authTokens<1){res.writeHead(429,{'Content-Type':'application/json','Retry-After':'5'});res.end(JSON.stringify({error:'Wallet login rate limit; retry shortly'}));return;}authTokens--;
  }
  const json=(value:unknown)=>{res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  if(req.method==='GET'){
   const assets:Record<string,[string,string]>={'/appearance.js':['appearance.js','text/javascript; charset=utf-8'],'/prooflane-mark.svg':['prooflane-mark.svg','image/svg+xml'],'/favicon.svg':['favicon.svg','image/svg+xml'],'/site.webmanifest':['site.webmanifest','application/manifest+json'],'/wallet-connector.js':['wallet-connector.js','text/javascript; charset=utf-8'],'/release-evidence.json':['release-evidence.json','application/json; charset=utf-8'],'/fonts/space-grotesk-variable.ttf':['fonts/space-grotesk-variable.ttf','font/ttf'],'/demo':['demo.html','text/html; charset=utf-8'],'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
   const asset=Object.hasOwn(assets,url.pathname)?assets[url.pathname]:undefined;if(asset){res.writeHead(200,{'Content-Type':asset[1]});res.end(await readFile(resolve(publicDirectory,asset[0])));return;}
   if(url.pathname==='/api/health'){json({mode:'local_test',database:backend?'postgres':'sqlite',ai:false,chain:false,...(auth?{walletAuth:true}:{})});return;}
  }
  const cookies=new Map<string,string>();
  for(const pair of (req.headers.cookie??'').split(';')){
   const [name,value]=pair.trim().split('=',2);
   if(name==='near_session'||name==='near_challenge'){
    invariant(!cookies.has(name),'duplicate authentication cookie');
    invariant(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'invalid authentication cookie');cookies.set(name,value);
   }
  }
  const session=cookies.get('near_session'),challenge=cookies.get('near_challenge');
  const authRoute=auth&&req.method==='POST'&&url.pathname.startsWith('/api/auth/');
  const actor=auth&&!authRoute?await auth.authorize(session,origin,req.method==='POST'):null;
  const cookie=(name:string,value:string,seconds:number)=>name+'='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+seconds;
  if(auth&&url.pathname==='/api/auth/session'&&req.method==='GET'){json({accountId:actor});return;}
  if(auth&&!authRoute&&!actor){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Wallet sign-in required'}));return;}
  const scopedStore=actor&&backend?backend.store.forActor(actor):store;
  const service=actor&&backend?new PostgresWorkflow(backend.store.forActor(actor)):backend??new LocalWorkflow(store as LocalStore);
  if(req.method==='GET'){
   if(url.pathname==='/api/orders'){json(await scopedStore.list());return;}
   const match=/^\/api\/orders\/([a-zA-Z0-9_-]+)(?:\/(template|reports|funding|evidence-package)(?:\/(sha256:[a-f0-9]{64}))?)?$/.exec(url.pathname);
   invariant(match,'route not found');const id=match[1]!;
   if(match[2]==='evidence-package'){invariant(!match[3],'unexpected report hash');res.setHeader('Content-Disposition','attachment; filename="'+id+'-evidence.json"');json(await buildEvidencePackage(scopedStore,id));return;}
   if(match[2]==='funding'){invariant(auth&&scopedStore instanceof PostgresExecutionStore,'Funding unavailable');json(await scopedStore.getFundingIntent(id));return;}
   if(match[2]==='template'){const taskId=url.searchParams.get('taskId');identifier(taskId,'task');json(await service.template(id,taskId));return;}
   if(match[2]==='reports'){invariant(match[3],'report hash required');json(await scopedStore.report(id,match[3]));return;}
   const detail=await service.details(id);
   const escrowAvailable=Boolean(auth&&scopedStore instanceof PostgresExecutionStore
    &&scopedStore.contractId!=='undeployed-escrow.testnet'
    &&record(record(detail.config,'order config').agreement,'order agreement').contractId===scopedStore.contractId);
   json({...detail,escrowAvailable});return;
  }
  invariant(req.method==='POST','method not allowed');invariant(req.headers['x-local-console']==='1','local console header required');
  invariant(/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''),'JSON content type required');
  invariant(Number(req.headers['content-length']??0)<=1100000,'body too large');const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=buffer.length;invariant(size<=1100000,'body too large');chunks.push(buffer);}
  let parsed:unknown;try{parsed=parseJsonStrict(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new ValidationError('Invalid JSON request');}
  const data=record(parsed,'request');
  if(authRoute){
   invariant(req.headers.origin===origin,'Same-origin wallet request required');
   if(url.pathname==='/api/auth/challenge'){const value=auth.issue(origin,challenge);res.setHeader('Set-Cookie',cookie('near_challenge',value.state,300));json(value);return;}
   if(url.pathname==='/api/auth/login'){const value=await auth.login(origin,challenge,data);auth.logout(session);res.setHeader('Set-Cookie',[cookie('near_session',value.token,3600),cookie('near_challenge','',0)]);json({accountId:value.accountId});return;}
   if(url.pathname==='/api/auth/logout'){auth.logout(session);res.setHeader('Set-Cookie',cookie('near_session','',0));json({accountId:null});return;}
   throw new Error('Unknown wallet route');
  }
  if(url.pathname==='/api/orders'){exactKeys(data,['requestId','budgetMinor','lifetimeSeconds'],'create request');identifier(data.requestId,'request');invariant(typeof data.budgetMinor==='string'&&typeof data.lifetimeSeconds==='number','invalid creation inputs');json(await service.create(data.requestId,data.budgetMinor,data.lifetimeSeconds));return;}
  const match=/^\/api\/orders\/([a-zA-Z0-9_-]+)\/(start|submit|expire|rollback-probe|enqueue|confirm-funding|check-refund|check-settlement)$/.exec(url.pathname);invariant(match,'route not found');const id=match[1]!;const action=match[2];
  if(action==='check-settlement'){invariant(auth&&scopedStore instanceof PostgresExecutionStore,'Settlement unavailable');exactKeys(data,[],'settlement check');json(await scopedStore.checkSettlement(id));return;}
  if(action==='check-refund'){invariant(auth&&scopedStore instanceof PostgresExecutionStore,'Refund unavailable');exactKeys(data,[],'refund check');json(await scopedStore.checkRefund(id));return;}
  if(action==='confirm-funding'){invariant(auth&&scopedStore instanceof PostgresExecutionStore,'Funding unavailable');exactKeys(data,['txHash'],'funding confirmation');invariant(typeof data.txHash==='string','Transaction ID required');json(await scopedStore.confirmFunding(id,data.txHash));return;}
  if(action==='enqueue'){exactKeys(data,[],'enqueue');json(await scopedStore.enqueue(id));return;}
  if(action==='rollback-probe'){exactKeys(data,['expectedVersion'],'probe');invariant(typeof data.expectedVersion==='number','version required');json(await service.rollbackProbe(id,data.expectedVersion));return;}
  const fields=action==='submit'?['taskId','artifactBytes','expectedVersion','requestId']:action==='start'?['taskId','expectedVersion','requestId']:['expectedVersion','requestId'];exactKeys(data,fields,'command');
  invariant(typeof data.expectedVersion==='number','version required');identifier(data.requestId,'request');
  if(action==='expire'){json(await service.expire(id,data.expectedVersion,data.requestId));return;}
  identifier(data.taskId,'task');
  if(action==='start'){json(await service.start(id,data.taskId,data.expectedVersion,data.requestId));return;}
  invariant(typeof data.artifactBytes==='string','artifact bytes required');json(await service.submit(id,data.taskId,data.artifactBytes,data.expectedVersion,data.requestId));
 }
 server.requestTimeout=20000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=100;server.maxHeadersCount=64;
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const filename=process.env.LOCAL_DB_PATH??resolve(dirname(fileURLToPath(import.meta.url)),'../../../artifacts/local/console.sqlite');
 const store=new LocalStore(filename);const port=Number(process.env.PORT??4317);invariant(Number.isInteger(port)&&port>=0&&port<=65535,'invalid port');
 const server=createConsoleServer(store);server.listen(port,'127.0.0.1',()=>{const address=server.address();console.log('Local fixture console: http://127.0.0.1:'+(typeof address==='object'&&address?address.port:port));console.log('Real SQLite transactions only. No AI, wallet, NEAR transaction or payment.');});
 const worker=new LocalWorker(store);
 const timer=setInterval(()=>{try{worker.tick();}catch(error){console.error('Local fixture worker:',error instanceof Error?error.message:error);}},500);timer.unref();
 const stop=()=>{clearInterval(timer);server.close(()=>{store.close();process.exit(0);});};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
