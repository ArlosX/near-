import {readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {operatorRun} from '../packages/shared/src/operator-run.ts';
import {invariant,record} from '../packages/shared/src/domain.ts';
import {canonicalJson,hash} from '../packages/agreements/src/agreement.ts';
import {readFinalTeeOrder} from '../packages/agreements/src/tee-settlement.ts';
import {readJsonResponse,parseJsonStrict} from '../packages/shared/src/json.ts';
import type {Agreement} from '../packages/shared/src/domain.ts';
async function main(){
 const folder=operatorRun().folder;
 await rm(resolve(folder,'next-intent.json'),{force:true});await rm(resolve(folder,'next-args.json'),{force:true});
 const cp=record(parseJsonStrict(await readFile(resolve(folder,'checkpoint.json'),'utf8')),'checkpoint');
 const a=parseJsonStrict(await readFile(resolve(folder,'agreement.json'),'utf8')) as Agreement;
 invariant(hash(a)===cp.agreementHash&&a.orderId===cp.orderId&&a.contractId==='agentwork-tee-arlosx.testnet'&&a.tasks.every(t=>t.recipientAccountId==='arlosx.testnet'),'Withdrawal agreement/recipient mismatch');
 const view=await readFinalTeeOrder(a);
 invariant(view.order.status==='SuccessCredited'&&[...view.tasks.values()].every(t=>record(t.result,'accepted task').accepted===true),'Full-parent success allocation required');
 const r=await fetch('https://rpc.testnet.fastnear.com',{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(12000),body:JSON.stringify({jsonrpc:'2.0',id:'withdrawal-balance',method:'query',params:{request_type:'call_function',account_id:a.contractId,method_name:'get_balance',args_base64:Buffer.from(canonicalJson({account:'arlosx.testnet'})).toString('base64'),block_id:view.blockHash}})});
 invariant(r.ok,'Withdrawal RPC unavailable');const p=record(await readJsonResponse(r,262144),'wallet RPC');invariant(!p.error&&p.id==='withdrawal-balance','Wallet balance unavailable');
 const result=record(p.result,'wallet view');invariant(result.block_hash===view.blockHash&&Array.isArray(result.result),'Wallet block mismatch');const balance=record(parseJsonStrict(Buffer.from(result.result).toString('utf8')),'claimable balance');
 invariant(balance.pending===null&&balance.available===a.totalAmountAtomic,'Expected exact full demo credit and no pending withdrawal; do not repeat an uncertain transfer');
 const intent={network:'testnet',signerId:'arlosx.testnet',receiverId:a.contractId,methodName:'withdraw_claimable',depositAtomic:'0',gasTgas:80,args:{}};
 await writeFile(resolve(folder,'withdrawal-preparation.json'),canonicalJson({orderId:a.orderId,agreementHash:hash(a),amountAtomic:balance.available,blockHash:view.blockHash,intent})+'\n');
 await writeFile(resolve(folder,'next-intent.json'),canonicalJson(intent)+'\n');await writeFile(resolve(folder,'next-args.json'),'{}\n');
 console.log(JSON.stringify({status:'OWNER_SIGNATURE_REQUIRED',method:intent.methodName,withdrawAtomic:balance.available,depositAtomic:'0',gasTgas:80}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Withdrawal preparation failed');process.exitCode=1;});
