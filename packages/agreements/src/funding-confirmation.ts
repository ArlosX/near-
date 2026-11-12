import {canonicalJson, fundingIntent, hash} from './agreement.ts';
import {invariant, record} from '../../shared/src/domain.ts';
import type {Agreement} from '../../shared/src/domain.ts';
import {readJsonResponse} from '../../shared/src/json.ts';

// Accept only a response obtained by the server from its Testnet RPC.
export function verifyFundingOutcome(agreement:Agreement,txHash:string,outcome:unknown,verificationMode?:'outlayer-tdx-direct-v1'){
 const intent=fundingIntent(agreement,verificationMode);
 invariant(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash),'Invalid transaction hash');
 invariant(intent.receiverId!=='undeployed-escrow.testnet','Escrow deployment required');
 const result=record(outcome,'transaction result');
 invariant(result.final_execution_status==='FINAL','Funding transaction is not final');
 const status=record(result.status,'execution status');
 invariant(typeof status.SuccessValue==='string'&&!Object.hasOwn(status,'Failure'),'Funding execution failed');
 const tx=record(result.transaction,'transaction');
 invariant(tx.hash===txHash&&tx.signer_id===intent.signerId&&tx.receiver_id===intent.receiverId,'Funding transaction identity mismatch');
 invariant(Array.isArray(tx.actions)&&tx.actions.length===1,'Expected one funding action');
 const action=record(tx.actions[0],'action');
 const call=record(action.FunctionCall,'function call');
 invariant(call.method_name===intent.methodName&&call.deposit===intent.depositAtomic,'Funding method or deposit mismatch');
 invariant(typeof call.args==='string'&&call.args.length<=16384,'Invalid funding arguments');
 const args:unknown=JSON.parse(Buffer.from(call.args,'base64').toString('utf8'));
 invariant(canonicalJson(args)===canonicalJson(intent.args),'Funding arguments differ from approved agreement');
 return {txHash,orderId:agreement.orderId,agreementHash:hash(agreement),depositAtomic:intent.depositAtomic};
}

export async function readFinalTestnetFunding(agreement:Agreement,txHash:string,verificationMode?:'outlayer-tdx-direct-v1'){
 invariant(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash),'Invalid transaction hash');
 invariant(agreement.network==='testnet'&&agreement.contractId!=='undeployed-escrow.testnet','Testnet escrow deployment required');
 const response=await fetch('https://rpc.testnet.fastnear.com',{
  method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(12000),
  body:JSON.stringify({jsonrpc:'2.0',id:'funding-confirmation',method:'tx',params:{
   tx_hash:txHash,sender_account_id:agreement.clientAccountId,wait_until:'FINAL'
  }})
 });
 invariant(response.ok,'Testnet RPC unavailable');
 const payload=record(await readJsonResponse(response,262144),'RPC response');
 invariant(!payload.error&&payload.id==='funding-confirmation','Testnet transaction unavailable');
 return verifyFundingOutcome(agreement,txHash,payload.result,verificationMode);
}
