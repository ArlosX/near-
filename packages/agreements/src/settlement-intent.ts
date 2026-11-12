import {canonicalJson,hash} from './agreement.ts';
import {invariant,record} from '../../shared/src/domain.ts';
import type {Agreement} from '../../shared/src/domain.ts';
import {verifyReportIntegrity} from '../../verification/src/report.ts';
import type {ReportEnvelope} from '../../verification/src/report.ts';

export function nextSettlementIntent(agreement:Agreement,chainOrder:unknown,reports:ReportEnvelope[],blockTimeNs:bigint){
 const order=record(chainOrder,'escrow order');
 const agreementHash=hash(agreement);
 invariant(order.order_id===agreement.orderId&&order.agreement_hash===agreementHash&&
  order.client===agreement.clientAccountId&&order.verifier===agreement.verifierAccountId&&
  order.principal===agreement.totalAmountAtomic&&order.cutoff_ns===agreement.resultCutoffNs,'Escrow order differs from approved agreement');
 invariant(['Open','SuccessCredited'].includes(String(order.status))&&order.refunded===false,'Order is unavailable for successful settlement');
 invariant(Array.isArray(order.tasks)&&order.tasks.length===agreement.tasks.length,'Escrow task graph mismatch');
 const chainTasks=new Map<string,Record<string,unknown>>();
 for(const value of order.tasks){
  const task=record(value,'escrow task');
  const approved=agreement.tasks.find(candidate=>candidate.id===task.id);
  invariant(approved&&!chainTasks.has(approved.id)&&approved.recipientAccountId===task.recipient&&
   approved.amountAtomic===task.amount&&canonicalJson(approved.dependsOn)===canonicalJson(task.depends_on),'Escrow task differs from approved agreement');
  chainTasks.set(approved.id,task);
 }
 const accepted=new Set<string>();
 const evidence=new Map<string,ReportEnvelope>();
 for(const task of agreement.tasks){
  const finalResult=chainTasks.get(task.id)!.result;
  const report=reports.find(candidate=>candidate.report.taskId===task.id&&candidate.report.decision==='accepted');
  if(report){
   invariant(verifyReportIntegrity(report)&&report.report.orderId===agreement.orderId&&
    report.report.agreementHash===agreementHash&&report.report.policyHash===task.verificationPolicyHash&&
    report.report.evaluatorAccountId===agreement.verifierAccountId,'Verification report binding mismatch');
   evidence.set(task.id,report);
   if(finalResult===null){
    invariant(report.report.sourceManifestHash===agreement.sourceManifestHash&&report.report.scope==='deterministic_only'&&
     report.report.checks.length>0&&report.report.checks.every(check=>check.passed===true)&&
     report.report.checks.some(check=>check.checker==='source_facts'),'Verified source facts required; create a new profile v2 order for legacy evidence');
   }
  }
  if(finalResult!==null){
   const result=record(finalResult,'final task result');
   invariant(report&&result.accepted===true&&result.report_hash===report.reportHash&&
    result.artifact_hash===report.report.artifactHash,'Recorded result differs from verification report');
   accepted.add(task.id);
  }
 }
 const common={receiverId:agreement.contractId,depositAtomic:'0'};
 if(order.status==='SuccessCredited'){
  invariant(accepted.size===agreement.tasks.length,'Credited order has incomplete verification evidence');
  return {state:'credited',intent:null};
 }
 if(accepted.size===agreement.tasks.length){
  return {state:'finalize',intent:{...common,signerId:agreement.clientAccountId,methodName:'finalize_success',args:{order_id:agreement.orderId}}};
 }
 invariant(blockTimeNs<BigInt(agreement.resultCutoffNs),'Order deadline passed before all results were recorded');
 const next=agreement.tasks.find(task=>!accepted.has(task.id)&&task.dependsOn.every(id=>accepted.has(id)));
 invariant(next,'No eligible task verdict');
 const envelope=evidence.get(next.id);
 invariant(envelope,'Accepted deterministic report required');
 return {state:'record',intent:{...common,signerId:agreement.verifierAccountId,methodName:'record_subtask_result',args:{
  order_id:agreement.orderId,task_id:next.id,accepted:true,report_hash:envelope.reportHash,artifact_hash:envelope.report.artifactHash
 }}};
}
