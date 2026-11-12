import {canonicalJson} from './agreement.ts';
import {invariant,record} from '../../shared/src/domain.ts';
import {parseJsonStrict} from '../../shared/src/json.ts';
export function verifyWithdrawalOutcome(contractId:string,recipient:string,amountAtomic:string,txHash:string,value:unknown){
 const r=record(value,'withdrawal receipt'),tx=record(r.transaction,'withdrawal transaction');
 invariant(r.final_execution_status==='FINAL'&&typeof record(r.status,'withdrawal status').SuccessValue==='string','Withdrawal is not final and successful');
 invariant(tx.hash===txHash&&tx.signer_id===recipient&&tx.receiver_id===contractId&&Array.isArray(tx.actions)&&tx.actions.length===1,'Withdrawal transaction identity mismatch');
 const call=record(record(tx.actions[0],'withdrawal action').FunctionCall,'withdrawal call');
 invariant(call.method_name==='withdraw_claimable'&&call.deposit==='0'&&typeof call.args==='string'&&canonicalJson(parseJsonStrict(Buffer.from(call.args,'base64').toString('utf8')))==='{}','Withdrawal call mismatch');
 invariant(Array.isArray(r.receipts_outcome)&&r.receipts_outcome.length>0,'Withdrawal receipts missing');
 const outcomes=r.receipts_outcome.map(item=>record(record(item,'receipt').outcome,'receipt outcome'));
 invariant(outcomes.every(o=>!Object.hasOwn(record(o.status,'receipt status'),'Failure')),'Withdrawal contains a failed receipt');
 const events=outcomes.filter(o=>o.executor_id===contractId).flatMap(o=>Array.isArray(o.logs)?o.logs:[]).filter(line=>typeof line==='string'&&line.startsWith('EVENT_JSON:')).map(line=>record(parseJsonStrict(String(line).slice(11)),'contract event')).filter(e=>e.standard==='work_escrow');
 const pending=events.filter(e=>e.event==='withdrawal_pending').flatMap(e=>Array.isArray(e.data)?e.data:[]).map(d=>record(d,'pending withdrawal'));
 const resolved=events.filter(e=>e.event==='withdrawal_resolved').flatMap(e=>Array.isArray(e.data)?e.data:[]).map(d=>record(d,'resolved withdrawal'));
 invariant(pending.length===1&&resolved.length===1,'Expected exactly one withdrawal operation');
 const a=pending[0]!,b=resolved[0]!;
 invariant(a.recipient===recipient&&b.recipient===recipient&&a.amount===amountAtomic&&b.amount===amountAtomic&&a.operation===b.operation&&b.success===true,'Successful full-amount callback not proven');
 return {txHash,recipient,amountAtomic,operation:b.operation,status:'FINAL_PAID'};
}
