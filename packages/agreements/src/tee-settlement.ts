import {canonicalJson,hash,hashBytes} from './agreement.ts';
import {invariant,record} from '../../shared/src/domain.ts';
import type {Agreement} from '../../shared/src/domain.ts';
import type {DemoConfig} from '../../orchestration/src/demo-data.ts';
import {verifyReportIntegrity,verifySubmission} from '../../verification/src/report.ts';
import type {ReportEnvelope,VerificationRequest} from '../../verification/src/report.ts';
import {readFinalEscrowOrder} from './refund-confirmation.ts';
import {readJsonResponse,parseJsonStrict} from '../../shared/src/json.ts';

export const TEE_PROFILE='outlayer-tdx-direct-v1' as const;
export const TEE_CODE='bb9fa85b135deb155f187f9ea49df8c907f90b885a88b90459f5bed208122051';
const COLLATERAL='2e80992e78a9e76e5726db22b7399c553439574e6fe512a3b311ae4c3d559140';
const MEASUREMENTS='5fccdb6924dbbe7ab09a4ca412e1b264196e44c47c795774326da89a376e45c3';
export type VerificationMode=typeof TEE_PROFILE;

/** Validate both economic identity and immutable TEE profile. A legacy order
 * with the same financial fields must never satisfy this check. */
export function validateTeeState(agreement:Agreement,chainOrder:unknown,teeState:unknown){
 const order=record(chainOrder,'TEE escrow order'),tee=record(teeState,'TEE profile');
 invariant(order.order_id===agreement.orderId&&order.agreement_hash===hash(agreement)&&
  order.client===agreement.clientAccountId&&order.verifier===agreement.verifierAccountId&&
  order.principal===agreement.totalAmountAtomic&&order.cutoff_ns===agreement.resultCutoffNs,'TEE economic agreement mismatch');
 invariant(tee.verification_mode===TEE_PROFILE&&tee.code_hash===TEE_CODE&&tee.collateral_hash===COLLATERAL&&tee.worker_measurements_hash===MEASUREMENTS,'TEE profile mismatch; legacy verdicts cannot authorize this order');
 const frozen=record(tee.state,'frozen TEE agreement');
 invariant(frozen.profile===TEE_PROFILE&&frozen.agreement_json===canonicalJson(agreement),'Frozen TEE agreement mismatch');
 invariant(Array.isArray(order.tasks)&&order.tasks.length===agreement.tasks.length&&Array.isArray(frozen.progress)&&frozen.progress.length===agreement.tasks.length,'TEE task graph mismatch');
 const tasks=new Map<string,Record<string,unknown>>(),progress=new Map<string,Record<string,unknown>>();
 for(const value of order.tasks){
  const t=record(value,'chain task'),a=agreement.tasks.find(x=>x.id===t.id);
  invariant(a&&!tasks.has(a.id)&&t.recipient===a.recipientAccountId&&t.amount===a.amountAtomic&&canonicalJson(t.depends_on)===canonicalJson(a.dependsOn),'TEE task allocation mismatch');tasks.set(a.id,t);
 }
 for(const value of frozen.progress){
  const p=record(value,'TEE progress'),a=agreement.tasks.find(x=>x.id===p.task_id);
  invariant(a&&!progress.has(a.id)&&Number.isSafeInteger(p.revision)&&Number(p.revision)>=0&&Number(p.revision)<=a.maxRevisions&&Object.hasOwn(p,'pending'),'TEE revision mismatch');progress.set(a.id,p);
 }
 return {order,tasks,progress};
}

export async function readFinalTeeOrder(agreement:Agreement){
 const view=await readFinalEscrowOrder(agreement);
 const response=await fetch('https://rpc.testnet.fastnear.com',{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(12000),body:JSON.stringify({jsonrpc:'2.0',id:'tee-view',method:'query',params:{request_type:'call_function',account_id:agreement.contractId,method_name:'get_tee_state',args_base64:Buffer.from(JSON.stringify({order_id:agreement.orderId})).toString('base64'),block_id:view.blockHash}})});
 invariant(response.ok,'Testnet TEE RPC unavailable');
 const payload=record(await readJsonResponse(response,262144),'TEE RPC response');
 invariant(!payload.error&&payload.id==='tee-view','Final TEE profile unavailable');
 const result=record(payload.result,'TEE view');
 invariant(result.block_hash===view.blockHash&&Array.isArray(result.result)&&result.result.length<=32768,'TEE view block mismatch');
 const teeState=parseJsonStrict(Buffer.from(result.result).toString('utf8'));
 return {...view,teeState,...validateTeeState(agreement,view.order,teeState)};
}

/** Local consistency check, not a substitute for the contract's Intel quote check. */
export function teeVerificationSummary(envelope:ReportEnvelope){
 const r=envelope.report;
 return {decision:r.decision,checks:r.checks.map(c=>({criterionId:c.criterionId,checker:c.checker,passed:c.passed})),orderId:r.orderId,taskId:r.taskId,agreementHash:r.agreementHash,policyHash:r.policyHash,sourceManifestHash:r.sourceManifestHash,artifactHash:r.artifactHash,artifactVersion:r.artifactVersion};
}

export function assertTeeTaskReady(agreement:Agreement,chainOrder:unknown,teeState:unknown,taskId:string,revision:number,dependencies:Record<string,string>,blockTimeNs:bigint){
 const {order,tasks,progress}=validateTeeState(agreement,chainOrder,teeState);
 invariant(order.status==='Open'&&order.refunded===false&&blockTimeNs<BigInt(agreement.resultCutoffNs),'TEE order is terminal or expired');
 const task=agreement.tasks.find(t=>t.id===taskId);invariant(task,'Unknown TEE task');
 invariant(tasks.get(taskId)!.result===null&&progress.get(taskId)!.pending===null&&progress.get(taskId)!.revision===revision,'TEE task is pending, final, or awaiting its on-chain revision');
 for(const id of task.dependsOn){const result=record(tasks.get(id)!.result,'On-chain accepted dependency required');invariant(result.accepted===true&&result.artifact_hash===dependencies[id],'Dependency is not accepted on-chain with these exact bytes');}
}

/** Rebuild pending input from immutable evidence and the chain-owned request/time.
 * A crash/reload must not generate a second, different execution commitment. */
export function planTeeTask(config:DemoConfig,chainOrder:unknown,teeState:unknown,reports:ReportEnvelope[],artifacts:Map<string,string>,blockTimeNs:bigint){
 const a=config.agreement,{order,tasks,progress}=validateTeeState(a,chainOrder,teeState);
 if(['Expired','Failed'].includes(String(order.status)))return {state:order.refunded===true?'refunded':'refund',intent:null};
 const accepted=new Set<string>();
 for(const task of a.tasks){
  const result=tasks.get(task.id)!.result;if(result===null)continue;
  const r=record(result,'TEE final result');
  invariant(r.accepted===true,'TEE task rejected; use the full refund path');
  const envelope=reports.find(e=>e.report.taskId===task.id&&e.report.decision==='accepted'&&e.report.artifactHash===r.artifact_hash);
  invariant(envelope&&verifyReportIntegrity(envelope)&&r.report_hash===hash(teeVerificationSummary(envelope)),'TEE accepted evidence mismatch');accepted.add(task.id);
 }
 const common={network:'testnet',receiverId:a.contractId,signerId:a.verifierAccountId,depositAtomic:'0',gasTgas:80};
 if(order.status==='SuccessCredited'){invariant(accepted.size===a.tasks.length,'Incomplete TEE allocation');return {state:'credited',intent:null};}
 invariant(order.status==='Open'&&order.refunded===false,'TEE order is not open');
 if(accepted.size===a.tasks.length)return {state:'finalize',intent:{...common,signerId:a.clientAccountId,methodName:'finalize_success',args:{order_id:a.orderId}}};
 if(blockTimeNs>=BigInt(a.resultCutoffNs))return {state:'expire',intent:null};
 const task=a.tasks.find(t=>!accepted.has(t.id)&&t.dependsOn.every(id=>accepted.has(id)));invariant(task,'No eligible TEE task');
 const p=progress.get(task.id)!;
 const envelope=reports.find(e=>e.report.taskId===task.id&&e.report.revision===p.revision);
 if(!envelope){invariant(p.pending===null,'Pending TEE request has no matching archived report');return {state:'model',taskId:task.id,intent:null};}
 invariant(verifyReportIntegrity(envelope),'TEE local report integrity mismatch');
 const r=envelope.report,artifactBytes=artifacts.get(task.id+':'+r.artifactVersion);invariant(typeof artifactBytes==='string'&&hashBytes(artifactBytes)===r.artifactHash,'TEE artifact bytes missing');
 const request:VerificationRequest={agreement:a,approvedAgreementHash:hash(a),taskId:task.id,policy:config.policies[task.id],sources:config.sources,artifactBytes,revision:r.revision,evaluatedAtNs:r.evaluatedAtNs,acceptedDependencies:task.dependsOn.map(id=>{
  const prior=reports.find(e=>e.report.taskId===id&&e.report.decision==='accepted')!.report,bytes=artifacts.get(id+':'+prior.artifactVersion);
  invariant(typeof bytes==='string'&&hashBytes(bytes)===prior.artifactHash,'TEE dependency archive mismatch');
  return {orderId:a.orderId,taskId:id,agreementHash:hash(a),artifactHash:prior.artifactHash,artifactBytes:bytes};
 })};
 invariant(verifySubmission(request).reportHash===envelope.reportHash,'TEE local evidence replay mismatch');
 if(p.pending===null)return {state:'prepare',taskId:task.id,intent:{...common,methodName:'prepare_tee_request',args:{order_id:a.orderId,task_id:task.id,verification_json:canonicalJson(request)}}};
 const pending=record(p.pending,'pending TEE request');
 invariant(pending.task_id===task.id&&pending.revision===r.revision&&pending.artifact_hash===r.artifactHash&&pending.policy_hash===r.policyHash&&typeof pending.prepared_at_ns==='string'&&/^\d+$/.test(pending.prepared_at_ns)&&typeof pending.request_id==='string','Pending TEE artifact mismatch');
 const inner=canonicalJson({schemaVersion:'1',requestId:pending.request_id,codeHash:'sha256:'+TEE_CODE,verification:{...request,evaluatedAtNs:pending.prepared_at_ns}});
 const input=canonicalJson({inputBytes:inner,expectedInputHash:hashBytes(inner),expectedCodeHash:'sha256:'+TEE_CODE});
 invariant(hashBytes(inner)===pending.inner_hash&&hashBytes(input).slice(7)===pending.input_hash&&Buffer.byteLength(input)<=65536,'Pending TEE input commitment mismatch');
 return {state:'execute',taskId:task.id,inputData:input,intent:null};
}
