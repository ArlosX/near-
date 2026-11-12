import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {canonicalJson,hash} from '../packages/agreements/src/agreement.ts';
import {readFinalTeeOrder} from '../packages/agreements/src/tee-settlement.ts';
import {refundState} from '../packages/agreements/src/refund-confirmation.ts';
import {invariant} from '../packages/shared/src/domain.ts';
import type {Agreement} from '../packages/shared/src/domain.ts';

async function main(){
 const folder=resolve('artifacts/local/release-refund');await mkdir(folder,{recursive:true});
 await rm(resolve(folder,'intent.json'),{force:true});await rm(resolve(folder,'args.json'),{force:true});
 const cp=JSON.parse(await readFile('artifacts/local/stage6-success/checkpoint.json','utf8'));
 const agreement=JSON.parse(await readFile('artifacts/local/stage6-success/agreement.json','utf8')) as Agreement;
 invariant(agreement.orderId===cp.orderId&&hash(agreement)===cp.agreementHash&&agreement.contractId==='agentwork-tee-arlosx.testnet'&&agreement.clientAccountId==='arlosx.testnet','Refund checkpoint mismatch');
 const view=await readFinalTeeOrder(agreement),state=refundState(agreement,view.order,view.blockTimeNs);
 await writeFile(resolve(folder,'last-state.json'),canonicalJson({state,blockHash:view.blockHash,order:view.order,teeState:view.teeState})+'\n');
 if(!['expire','claim'].includes(state)){console.log(JSON.stringify({state,signatureRequired:false}));return;}
 const intent={receiverId:agreement.contractId,signerId:agreement.clientAccountId,methodName:state==='expire'?'mark_expired':'claim_refund',depositAtomic:'0',gasTgas:80,args:{order_id:agreement.orderId}};
 await writeFile(resolve(folder,'intent.json'),canonicalJson(intent)+'\n');await writeFile(resolve(folder,'args.json'),canonicalJson(intent.args)+'\n');
 console.log(JSON.stringify({state,signatureRequired:true,method:intent.methodName,principalAtomic:agreement.totalAmountAtomic,depositAtomic:'0'}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Refund preparation failed');process.exitCode=1;});
