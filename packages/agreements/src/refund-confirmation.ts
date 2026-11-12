import {hash} from './agreement.ts';
import {invariant,record} from '../../shared/src/domain.ts';
import type {Agreement} from '../../shared/src/domain.ts';
import {readJsonResponse} from '../../shared/src/json.ts';

export function refundState(agreement:Agreement,value:unknown,blockTimeNs:bigint){
 const order=record(value,'escrow order');
 invariant(order.order_id===agreement.orderId&&order.client===agreement.clientAccountId&&
  order.agreement_hash===hash(agreement)&&order.principal===agreement.totalAmountAtomic&&
  order.cutoff_ns===agreement.resultCutoffNs,'Escrow order does not match approved agreement');
 invariant(typeof order.refunded==='boolean'&&Object.hasOwn(order,'refund_pending'),'Invalid refund state');
 const eligible=order.status==='Failed'||order.status==='Expired';
 if(order.refunded){
  invariant(eligible&&order.refund_pending===null,'Inconsistent settled refund state');
  return 'refunded';
 }
 if(order.refund_pending!==null)return 'pending';
 if(eligible)return 'claim';
 const accepted=Array.isArray(order.tasks)&&order.tasks.length===agreement.tasks.length&&order.tasks.every(task=>task?.result?.accepted===true);
 if(order.status==='Open'&&!accepted&&blockTimeNs>=BigInt(agreement.resultCutoffNs))return 'expire';
 return 'unavailable';
}

async function rpc(method:string,params:Record<string,unknown>){
 const response=await fetch('https://rpc.testnet.fastnear.com',{
  method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000),
  body:JSON.stringify({jsonrpc:'2.0',id:'refund-view',method,params})
 });
 invariant(response.ok,'Testnet RPC unavailable');
 const payload=record(await readJsonResponse(response,262144),'RPC response');
 invariant(!payload.error&&payload.id==='refund-view','Final escrow state unavailable');
 return record(payload.result,'RPC result');
}

export async function readFinalEscrowOrder(agreement:Agreement){
 invariant(agreement.network==='testnet'&&agreement.contractId!=='undeployed-escrow.testnet','Testnet escrow deployment required');
 const view=await rpc('query',{request_type:'call_function',account_id:agreement.contractId,method_name:'get_order',
  args_base64:Buffer.from(JSON.stringify({order_id:agreement.orderId})).toString('base64'),finality:'final'});
 invariant(typeof view.block_hash==='string'&&Array.isArray(view.result)&&view.result.length<=32768,'Invalid escrow response');
 const block=await rpc('block',{block_id:view.block_hash});
 const header=record(block.header,'block header');
 invariant(header.hash===view.block_hash&&typeof header.timestamp_nanosec==='string'&&/^\d+$/.test(header.timestamp_nanosec),'Invalid finalized block time');
 return {order:JSON.parse(Buffer.from(view.result).toString('utf8')) as unknown,blockTimeNs:BigInt(header.timestamp_nanosec),blockHash:view.block_hash};
}

export async function readFinalRefund(agreement:Agreement){
 const view=await readFinalEscrowOrder(agreement);
 return {
  state:refundState(agreement,view.order,view.blockTimeNs),
  blockHash:view.blockHash,
  amountAtomic:agreement.totalAmountAtomic
 };
}
