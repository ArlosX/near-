import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const folder=resolve('artifacts/local/worker-profile-v3'),account='agentwork-tee-v2-arlosxq.testnet';
const wasm=await readFile(resolve(folder,'work_escrow_v3.wasm')),sha=createHash('sha256').update(wasm).digest('hex');
if(sha!=='6f9607448a279d853e3ad95e8f59b4760ccd8110bde27bc9832d94ae9789e09f')throw Error('Unreviewed v3 WASM');
const crypto=JSON.parse(await readFile(resolve(folder,'crypto-conformance.json'),'utf8'));
if(!crypto.passed||crypto.results.length!==6)throw Error('V3 cryptographic tests incomplete');
const sandbox=await readFile(resolve(folder,'upgrade-sandbox.log'),'utf8');
if(!/fail 0/.test(sandbox)||!/pass 5/.test(sandbox))throw Error('V3 financial/upgrade Sandbox gates incomplete');
async function rpc(params){const r=await fetch('https://rpc.testnet.fastnear.com',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({jsonrpc:'2.0',id:'v3-upgrade-review',method:'query',params})});const j=await r.json();if(!r.ok||j.error)throw Error('Upgrade review RPC unavailable');return j.result;}
const a=await rpc({request_type:'view_account',account_id:account,finality:'final'});
if(a.code_hash!=='3eFnuWdxJXzvSdMYXYzUYZFvoHFqxfBbk1CUxdWA58hH')throw Error('Expected currently deployed v2 code; do not repeat an uncertain upgrade');
if(wasm.length+4096>1376256)throw Error('V3 exceeds reviewed base storage envelope');
const snapshots=[];for(const run of ['stage6-success-live-v2','stage6-success-live-v2-final']){const cp=JSON.parse(await readFile('artifacts/local/'+run+'/checkpoint.json','utf8'));const args_base64=Buffer.from(JSON.stringify({order_id:cp.orderId})).toString('base64');const states={};for(const method_name of ['get_order','get_tee_state']){const r=await rpc({request_type:'call_function',account_id:account,method_name,args_base64,block_id:a.block_hash});states[method_name]=JSON.parse(Buffer.from(r.result).toString());}if(states.get_tee_state.verification_mode!=='outlayer-tdx-direct-v2')throw Error('Unexpected frozen order profile');snapshots.push({run,orderId:cp.orderId,...states});}
const sources={};for(const path of ['contracts/work-escrow/Cargo.toml','contracts/work-escrow/Cargo.lock','contracts/work-escrow/src/tee.rs','contracts/work-escrow/src/contract.rs','contracts/work-escrow/src/state.rs','contracts/work-escrow/src/near_crypto.rs','contracts/work-escrow/src/intel-root.der','contracts/work-escrow/src/lib.rs'])sources[path]=createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile(resolve(folder,'upgrade-review.json'),JSON.stringify({account,sha256:sha,wasmBytes:wasm.length,profileForNewOrders:'outlayer-tdx-direct-v3',oldFrozenProfilesUnchanged:true,stateLayoutChanged:false,initialize:false,sources,beforeAccount:a,snapshots,preparedAt:new Date().toISOString(),status:'REVIEWED_NOT_UPGRADED'},null,2));console.log('Reviewed CODE-ONLY upgrade. Existing orders retain v2. No initialization, no transaction sent.');
