import { invariant } from '../../shared/src/domain.ts';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'REVISION_REQUIRED' | 'ACCEPTED' | 'REJECTED';
export type TaskRun = { status: TaskStatus; revisions: number; maxRevisions: number; artifactHash: string | null };
export type Action =
  | { type: 'start'; dependenciesAccepted: boolean }
  | { type: 'submit'; artifactHash: string }
  | { type: 'revise' }
  | { type: 'accept'; artifactHash: string }
  | { type: 'reject' };
// Pure transition model only. Chain acceptance/identity authorization must be enforced by the future service.
export function transition(run: TaskRun, action: Action, nowNs: bigint, cutoffNs: bigint): TaskRun {
  invariant(nowNs < cutoffNs, 'result cutoff reached');
  invariant(!['ACCEPTED','REJECTED'].includes(run.status), 'terminal task');
  switch (action.type) {
    case 'start':
      invariant(action.dependenciesAccepted, 'dependencies not accepted');
      invariant(run.status === 'PENDING' || run.status === 'REVISION_REQUIRED', 'cannot start');
      return { ...run, status: 'IN_PROGRESS' };
    case 'submit':
      invariant(run.status === 'IN_PROGRESS', 'cannot submit');
      invariant(/^sha256:[a-f0-9]{64}$/.test(action.artifactHash), 'invalid artifact hash');
      return { ...run, status: 'SUBMITTED', artifactHash: action.artifactHash };
    case 'revise':
      invariant(run.status === 'SUBMITTED' && run.revisions < run.maxRevisions, 'revision unavailable');
      return { ...run, status: 'REVISION_REQUIRED', revisions: run.revisions + 1 };
    case 'accept':
      invariant(run.status === 'SUBMITTED' && run.artifactHash === action.artifactHash, 'acceptance artifact mismatch');
      return { ...run, status: 'ACCEPTED' };
    case 'reject':
      invariant(run.status === 'SUBMITTED', 'cannot reject before verification');
      return { ...run, status: 'REJECTED' };
  }
}
export function parentOutcome(results: ('accepted' | 'rejected' | null)[], nowNs: bigint, cutoffNs: bigint) {
  invariant(results.length > 0, 'required results missing');
  if (results.includes('rejected')) return 'FAILED';
  if (results.every(r => r === 'accepted')) return 'SUCCESS_ELIGIBLE';
  return nowNs >= cutoffNs ? 'EXPIRED' : 'OPEN';
}
export function allocationScore(values: Record<'S'|'R'|'Q'|'C'|'D', number>, weights: Record<'w1'|'w2'|'w3'|'w4'|'w5', number>): number {
  invariant(Object.values(values).every(v => Number.isFinite(v) && v >= 0 && v <= 1), 'scores must be normalized');
  invariant(Object.values(weights).every(v => Number.isFinite(v) && v >= 0), 'invalid weights');
  return weights.w1*values.S + weights.w2*values.R + weights.w3*values.Q - weights.w4*values.C - weights.w5*values.D;
}
