import {canonicalJson,hash,hashBytes} from '../../agreements/src/agreement.ts';
import {digest,exactKeys,identifier,invariant,record} from '../../shared/src/domain.ts';
import {parseJsonStrict} from '../../shared/src/json.ts';
import {verifySubmission} from '../../verification/src/report.ts';
import type {VerificationRequest} from '../../verification/src/report.ts';

export const MAX_JUDGE_INPUT_BYTES=4*1024*1024;
export type JudgeInput={schemaVersion:'1';requestId:string;codeHash:string;verification:VerificationRequest};
export type ExpectedExecution={inputHash:string;codeHash:string};

export function encodeJudgeInput(input:JudgeInput):string{return canonicalJson(input);}

/** Local reference protocol only. Expected commitments must be retained by the
 * service before dispatch; receiving them from the response proves nothing. */
export function runLocalJudge(bytes:string,expected:ExpectedExecution){
 invariant(Buffer.byteLength(bytes,'utf8')<=MAX_JUDGE_INPUT_BYTES,'judge input too large');
 digest(expected.inputHash,'expected judge input');digest(expected.codeHash,'expected judge code');
 invariant(hashBytes(bytes)===expected.inputHash,'judge input commitment mismatch');
 const input=record(parseJsonStrict(bytes),'judge input');
 exactKeys(input,['schemaVersion','requestId','codeHash','verification'],'judge input');
 invariant(canonicalJson(input)===bytes,'judge input must be canonical JSON');
 invariant(input.schemaVersion==='1','unsupported judge protocol');identifier(input.requestId,'judge request');
 invariant(input.codeHash===expected.codeHash,'judge code commitment mismatch');
 const request=record(input.verification,'verification');
 exactKeys(request,['agreement','approvedAgreementHash','taskId','policy','sources','artifactBytes','revision','evaluatedAtNs','acceptedDependencies'],'verification request');
 invariant(record(request.policy,'judge policy').schemaVersion==='2','judge requires deterministic profile v2');
 const report=verifySubmission(request as unknown as VerificationRequest);
 const result={schemaVersion:'1',execution:'local-reference-not-attested',requestId:input.requestId,
  inputHash:expected.inputHash,codeHash:expected.codeHash,
  report,limitations:['No hardware attestation or caller authentication.',
   'Evaluation time and accepted dependency context are supplied by the trusted caller.',
   'This output must not authorize a TEE-mode settlement.']};
 return {result,outputHash:hash(result)};
}

export type LocalJudgeOutput=ReturnType<typeof runLocalJudge>;
/** Replays the reference rules as well as hashes. This is deterministic
 * consistency, NOT attestation verification and NOT proof of hardware origin. */
export function checkLocalJudgeOutput(bytes:string,expected:ExpectedExecution,output:unknown){
 const value=record(output,'judge output');exactKeys(value,['result','outputHash'],'judge output');
 invariant(hash(value.result)===value.outputHash,'judge output hash mismatch');
 const replay=runLocalJudge(bytes,expected);
 invariant(canonicalJson(value)===canonicalJson(replay),'judge result/context mismatch');
 return {consistent:true,attested:false,settlementAuthorized:false} as const;
}
