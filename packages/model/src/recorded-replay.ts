import {hash,hashBytes} from '../../agreements/src/agreement.ts';
import {invariant,record} from '../../shared/src/domain.ts';
import type {DemoConfig} from '../../orchestration/src/demo-data.ts';
import {verifyReportIntegrity} from '../../verification/src/report.ts';
import type {ReportEnvelope} from '../../verification/src/report.ts';
import {modelArtifactBytes} from './artifact.ts';

/** Explicit replay of unchanged recorded bytes, never a new provider call.
 * Destination agreement and dependency acceptance are separately checked by
 * orchestration/TEE. No rewriting task IDs, facts, versions or dependency hashes. */
export function validateRecordedReplay(destination:DemoConfig,source:DemoConfig,envelope:ReportEnvelope,bytes:string,completion:unknown,expectedVersion:number,dependencyHashes:Record<string,string>){
 const r=envelope.report,call=record(completion,'recorded model completion');
 invariant(verifyReportIntegrity(envelope)&&r.decision==='accepted'&&r.agreementHash===hash(source.agreement)&&r.orderId===source.agreement.orderId,'Recorded source report is not valid');
 invariant(hash(source.sources)===hash(destination.sources)&&hash(source.policies[r.taskId])===hash(destination.policies[r.taskId]),'Replay source/policy differs from the destination agreement');
 invariant(typeof call.content==='string'&&call.finishReason==='stop'&&modelArtifactBytes(call.content)===bytes&&hashBytes(bytes)===r.artifactHash,'Recorded provider response differs from artifact bytes');
 const artifact=record(JSON.parse(bytes),'recorded artifact');
 invariant(artifact.taskId===r.taskId&&artifact.version===expectedVersion&&hash(artifact.inputArtifactHashes)===hash(dependencyHashes),'Replay version or accepted predecessor differs');
 return {bytes,execution:'recorded-model-output-replay' as const,sourceOrderId:r.orderId,sourceArtifactHash:r.artifactHash,sourceReportHash:envelope.reportHash};
}
