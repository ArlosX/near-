import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {invariant,record} from '../packages/shared/src/domain.ts';
import {readJsonResponse,parseJsonStrict} from '../packages/shared/src/json.ts';
import {canonicalJson} from '../packages/agreements/src/agreement.ts';
const CONTRACT='agentwork-tee-arlosx.testnet',ACTOR='arlosx.testnet';
async function query(params:unknown){const r=await fetch('https://rpc.testnet.fastnear.com',{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(12000),body:JSON.stringify({jsonrpc:'2.0',id:'preflight',method:'query',params})});invariant(r.ok,'Preflight RPC unavailable');const p=record(await readJsonResponse(r,262144),'preflight RPC');invariant(!p.error&&p.id==='preflight','Preflight query failed');return record(p.result,'preflight view');}
async function main(){
 const contract=await query({request_type:'view_account',account_id:CONTRACT,finality:'final'});
 invariant(contract.code_hash==='4eaQHrw1xjUjtHjJg329UvV65t7UoWzTkKUKN4vS9JvM','Escrow code hash changed');
 const payer=await query({request_type:'view_account',account_id:ACTOR,finality:'final'});
 const view=await query({request_type:'call_function',account_id:CONTRACT,method_name:'get_accounting',args_base64:'e30=',finality:'final'});
 invariant(Array.isArray(view.result),'Accounting unavailable');const a=record(parseJsonStrict(Buffer.from(view.result).toString('utf8')),'accounting');
 const liability=BigInt(String(a.escrow))+BigInt(String(a.available_credits))+BigInt(String(a.pending_transfers));
 const nextReserve=(BigInt(String(a.reserved_storage_bytes))+16384n)*10000000000000000000n;
 const headroom=BigInt(String(contract.amount))-liability-nextReserve;
 const requiredSigner=300000000000000000000000n;
 const result={contract:CONTRACT,signer:ACTOR,signerAmount:String(payer.amount),operatorHeadroomAfterNextSlot:headroom.toString(),currentOrders:String(a.order_count),fundingReady:BigInt(String(a.order_count))<64n&&headroom>=20000000000000000000000n&&BigInt(String(payer.amount))>=requiredSigner};
 await mkdir('artifacts/local/release-preflight',{recursive:true});await writeFile('artifacts/local/release-preflight/status.json',canonicalJson(result)+'\n');
 if(process.argv.includes('--prepare-topup')){
  invariant(BigInt(String(payer.amount))<requiredSigner,'Signer balance already sufficient; do not transfer');
  const amount=100000000000000000000000n;
  invariant(headroom>=amount+20000000000000000000000n,'Operator cannot cover top-up while preserving next-slot reserve and fee headroom');
  invariant(liability===0n,'Top-up disabled while contract has outstanding liabilities');
  await writeFile(resolve('artifacts/local/release-preflight/topup.json'),canonicalJson({signerId:CONTRACT,receiverId:ACTOR,amountNear:'0.1',preservesNextSlotReserve:true})+'\n');
 }
 console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Preflight failed');process.exitCode=1;});
