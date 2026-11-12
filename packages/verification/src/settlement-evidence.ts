import {hash,hashBytes} from '../../agreements/src/agreement.ts';
import {invariant} from '../../shared/src/domain.ts';
import type {Agreement} from '../../shared/src/domain.ts';
import {verifySubmission} from './report.ts';
import type {ReportEnvelope} from './report.ts';

// Recompute rather than trusting a report's self-consistent hash or "accepted"
// label. All bytes must come from the owner's immutable evidence repository.
export function recheckSettlementEvidence(
 config:{agreement:Agreement;policies:Record<string,unknown>;sources:unknown},
 reports:ReportEnvelope[],artifacts:Map<string,string>,taskId:string
){
 const agreementHash=hash(config.agreement),checked=new Set<string>(),visiting=new Set<string>();
 function check(id:string):ReportEnvelope{
  invariant(!visiting.has(id),'cyclic settlement evidence');
  const task=config.agreement.tasks.find(candidate=>candidate.id===id);invariant(task,'unknown settlement task');
  const candidates=reports.filter(candidate=>candidate.report.taskId===id&&candidate.report.decision==='accepted');
  invariant(candidates.length===1,'Exactly one accepted report required per settlement task');
  const envelope=candidates[0]!,report=envelope.report;
  if(checked.has(id))return envelope;
  visiting.add(id);
  const dependencies=task.dependsOn.map(dep=>{
   const prior=check(dep).report,bytes=artifacts.get(dep+':'+prior.artifactVersion);
   invariant(typeof bytes==='string','settlement dependency bytes missing');
   return {orderId:config.agreement.orderId,taskId:dep,agreementHash,artifactHash:prior.artifactHash,artifactBytes:bytes};
  });
  const bytes=artifacts.get(id+':'+report.artifactVersion);
  invariant(typeof bytes==='string'&&hashBytes(bytes)===report.artifactHash,'settlement artifact bytes mismatch');
  const rebuilt=verifySubmission({agreement:config.agreement,approvedAgreementHash:agreementHash,taskId:id,policy:config.policies[id],sources:config.sources,artifactBytes:bytes,revision:report.revision,evaluatedAtNs:report.evaluatedAtNs,acceptedDependencies:dependencies});
  invariant(rebuilt.report.decision==='accepted'&&rebuilt.reportHash===envelope.reportHash,'Settlement evidence revalidation failed');
  visiting.delete(id);checked.add(id);return envelope;
 }
 return check(taskId);
}
