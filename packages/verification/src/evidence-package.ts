import type {DemoConfig} from '../../orchestration/src/demo-data.ts';
import {hash,hashBytes,validateAgreement} from '../../agreements/src/agreement.ts';
import {invariant} from '../../shared/src/domain.ts';
import {verifyReportIntegrity} from './report.ts';
import type {ReportEnvelope} from './report.ts';
import type {LocalStore} from '../../database/src/local-store.ts';

type Snapshot=Pick<ReturnType<LocalStore['details']>,'orderId'|'config'|'state'|'version'|'reports'>;
type EvidenceStore={
 details(id:string):Snapshot|Promise<Snapshot>;
 report(id:string,reportHash:string):ReportEnvelope|Promise<ReportEnvelope>;
 artifact(id:string,taskId:string,version:number):{bytes:string;hash:string}|Promise<{bytes:string;hash:string}>;
};
export async function buildEvidencePackage(store:EvidenceStore,orderId:string){
 const snapshot=await store.details(orderId);
 const config=snapshot.config as DemoConfig;
 const agreement=validateAgreement(config.agreement,0n),agreementHash=hash(agreement);
 invariant(hash(config.sources)===agreement.sourceManifestHash,'package source commitment mismatch');
 for(const task of agreement.tasks)invariant(hash(config.policies[task.id])===task.verificationPolicyHash,'package policy commitment mismatch');
 const deliveries=[];
 for(const reference of snapshot.reports){
  // The store enforces ownership and, when configured, reads private archives.
  const envelope=await store.report(orderId,reference.reportHash),report=envelope.report;
  invariant(verifyReportIntegrity(envelope),'invalid archived report');
  invariant(report.orderId===orderId&&report.agreementHash===agreementHash,'cross-order evidence');
  const task=agreement.tasks.find(task=>task.id===report.taskId);
  invariant(task&&report.policyHash===task.verificationPolicyHash,'evidence policy mismatch');
  invariant(report.sourceManifestHash===hash(config.sources),'evidence source mismatch');
  const artifact=await store.artifact(orderId,report.taskId,report.artifactVersion);
  invariant(hashBytes(artifact.bytes)===report.artifactHash&&artifact.hash===report.artifactHash,'evidence artifact mismatch');
  deliveries.push({taskId:task.id,agentId:task.agentId,runtimeVersion:task.runtimeVersion,
   agreementSchemaVersion:agreement.schemaVersion,agreementHash,criteriaHash:hash(task.criteria),policyHash:task.verificationPolicyHash,
   outputVersion:report.artifactVersion,fileHash:artifact.hash,artifactBytes:artifact.bytes,
   dependsOn:task.dependsOn,evaluatedAtNs:report.evaluatedAtNs,timestampAuthority:'application-service-not-independent-time-proof',
   report:envelope});
 }
 invariant((await store.details(orderId)).version===snapshot.version,'order changed during evidence export; refresh and retry');
 const content={schemaVersion:'1',kind:'agent-work-evidence',orderId,workflowVersion:snapshot.version,
  agreement,agreementHash,sources:config.sources,policies:config.policies,
  workflowState:snapshot.state,deliveries,
  trust:{verification:'trusted-off-chain-deterministic',tee:'not-integrated',
   integrity:'hash-and-binding-checks-not-authenticity',onChainAcceptance:'not-established-by-this-export',
   settlement:'local-success-is-not-payment; allocated-credit-is-not-withdrawal'}};
 return {content,packageHash:hash(content)};
}
