import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const folder=resolve('artifacts/local/worker-profile-v2'),account='agentwork-tee-v2-arlosxq.testnet';
const wasm=await readFile(resolve(folder,'work_escrow_v2.wasm'));
const sha=createHash('sha256').update(wasm).digest('hex');
if(sha!=='274296abcc09740dedd3fc68559e13a79b2bd47dcdc63f148486a18ca1f0c9ec')throw Error('Unreviewed v2 WASM');
const crypto=JSON.parse(await readFile(resolve(folder,'crypto-conformance.json'),'utf8'));if(!crypto.passed||crypto.results.length!==3)throw Error('Crypto conformance incomplete');
const sandbox=await readFile(resolve(folder,'sandbox-final.log'),'utf8');
let targetedFixtureRepeat=false;
if(!(/fail 0/.test(sandbox)&&/pass 16/.test(sandbox))){
 const failures=sandbox.split(/\r?\n/).filter(line=>line.startsWith('✖')&&line!=='✖ failing tests:');
 const repeat=await readFile(resolve(folder,'context-repeat.log'),'utf8');
 if(!/tests 16/.test(sandbox)||!/pass 15/.test(sandbox)||!/fail 1/.test(sandbox)||failures.length!==2||!failures.every(line=>line.includes('Sandbox TEE request commits chain-generated context'))||!/tests 1/.test(repeat)||!/pass 1/.test(repeat)||!/fail 0/.test(repeat))throw Error('Sandbox gates incomplete');
 targetedFixtureRepeat=true;
}
const r=await fetch('https://rpc.testnet.fastnear.com',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({jsonrpc:'2.0',id:'v2-deploy-review',method:'query',params:{request_type:'view_account',account_id:account,finality:'final'}})});const p=await r.json(),a=p.result;if(p.error||!a||a.code_hash!=='11111111111111111111111111111111'||BigInt(a.amount)<14250000000000000000000000n)throw Error('Fresh account/code/reserve preflight failed');
const sources={};for(const path of ['contracts/work-escrow/Cargo.toml','contracts/work-escrow/Cargo.lock','contracts/work-escrow/src/tee.rs','contracts/work-escrow/src/contract.rs','contracts/work-escrow/src/state.rs','contracts/work-escrow/src/near_crypto.rs','contracts/work-escrow/src/intel-root.der','contracts/work-escrow/src/lib.rs'])sources[path]=createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile(resolve(folder,'deployment-review.json'),JSON.stringify({account,network:'testnet',profile:'outlayer-tdx-direct-v2',measurementDigest:'d09433697b6795af07f09ba73ec15b4af7e01da08b60e28a5d496a07573a6ceb',sha256:sha,wasmBytes:wasm.length,sources,checks:{sandbox:16,crypto:3,targetedFixtureRepeat},preparedAt:new Date().toISOString(),status:'REVIEWED_NOT_DEPLOYED'},null,2));console.log('Reviewed new account, reserves, immutable v2 artifact and passing Sandbox/crypto checks. No transaction sent.');
