import { atomic, digest, exactKeys, identifier, invariant, record, U64_MAX } from '../../shared/src/domain.ts';
import { canonicalJson, hash, hashBytes, validateAgreement } from '../../agreements/src/agreement.ts';
import { eligible, verifySupplier, verifySourceFacts } from './verify.ts';
import { parseArtifact, validatePolicy, validateSources } from './policy.ts';
import type { Artifact } from './policy.ts';

// This context MUST come from the authenticated orchestration/persistence layer,
// reconciled against final chain acceptance. Never accept it from worker payloads.
export type AcceptedDependency = {
  orderId: string; taskId: string; agreementHash: string;
  artifactHash: string; artifactBytes: string;
};
// approvedAgreementHash, revision, time and acceptedDependencies are service-owned context.
// This stateless function does not enforce persisted terminal states or global retry counts.
export type VerificationRequest = {
  agreement: unknown; approvedAgreementHash: string;
  taskId: string; policy: unknown; sources: unknown;
  artifactBytes: string; revision: number; evaluatedAtNs: string;
  acceptedDependencies: AcceptedDependency[];
};
export type ReportCheck = {
  criterionId: string; checker: string; checkerVersion: 1;
  passed: boolean; expected: unknown; actual: unknown; reason: string;
};
export type ReportBody = {
  schemaVersion: '1'; scope: 'deterministic_only';
  orderId: string; taskId: string; agreementHash: string; policyHash: string;
  sourceManifestHash: string; artifactHash: string;
  artifactVersion: number; revision: number; evaluatorAccountId: string;
  evaluatedAtNs: string; decision: 'accepted' | 'revision_required' | 'rejected';
  checks: ReportCheck[]; limitations: string[];
};
export type ReportEnvelope = { report: ReportBody; reportHash: string };
function immutable<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(immutable); Object.freeze(value); }
  return value;
}
function boundedBytes(value: unknown): asserts value is string {
  invariant(typeof value === 'string' && Buffer.byteLength(value,'utf8') <= 1000000, 'artifact must be at most 1MB of UTF-8 JSON');
}
export function verifySubmission(request: VerificationRequest): ReportEnvelope {
  digest(request.approvedAgreementHash, 'approved agreement'); identifier(request.taskId, 'task');
  const now = atomic(request.evaluatedAtNs, 'evaluation time', U64_MAX);
  const agreement = validateAgreement(request.agreement, now);
  const agreementHash = hash(agreement);
  invariant(agreementHash === request.approvedAgreementHash, 'approved agreement hash mismatch');
  const task = agreement.tasks.find(t => t.id === request.taskId); invariant(task, 'unknown task');
  invariant(Number.isSafeInteger(request.revision) && request.revision >= 0 && request.revision <= task.maxRevisions, 'revision out of bounds');
  boundedBytes(request.artifactBytes);
  const policy = validatePolicy(request.policy, task);
  const sources = validateSources(request.sources);
  invariant(hash(sources) === agreement.sourceManifestHash, 'source manifest hash mismatch');
  invariant(Array.isArray(request.acceptedDependencies) && request.acceptedDependencies.length === task.dependsOn.length, 'accepted dependency context missing');
  const dependencies = new Map<string, Artifact>();
  const dependencyHashes: Record<string, string> = Object.create(null) as Record<string,string>;
  for (const dep of request.acceptedDependencies) {
    const d = record(dep, 'accepted dependency');
    exactKeys(d, ['orderId','taskId','agreementHash','artifactHash','artifactBytes'], 'accepted dependency');
    invariant(dep.orderId === agreement.orderId && dep.agreementHash === agreementHash, 'cross-order dependency context');
    invariant(task.dependsOn.includes(dep.taskId) && !dependencies.has(dep.taskId), 'unexpected/duplicate dependency');
    digest(dep.artifactHash, 'accepted artifact'); boundedBytes(dep.artifactBytes);
    invariant(hashBytes(dep.artifactBytes) === dep.artifactHash, 'accepted artifact content mismatch');
    const parsed = record(JSON.parse(dep.artifactBytes), 'accepted artifact');
    const predecessor = agreement.tasks.find(t => t.id === dep.taskId)!;
    invariant(Number.isSafeInteger(parsed.version) && Number(parsed.version) >= 1 && Number(parsed.version) <= predecessor.maxRevisions + 1, 'invalid accepted artifact version');
    dependencies.set(dep.taskId, parseArtifact(dep.artifactBytes, dep.taskId, Number(parsed.version)));
    dependencyHashes[dep.taskId] = dep.artifactHash;
  }
  const checks: ReportCheck[] = [];
  const add = (criterionId: string, checker: string, passed: boolean, expected: unknown, actual: unknown, reason: string) => {
    checks.push({ criterionId, checker, checkerVersion: 1, passed, expected, actual, reason });
  };
  const artifactVersion = request.revision + 1;
  let artifact: Artifact | undefined;
  try {
    artifact = parseArtifact(request.artifactBytes, task.id, artifactVersion);
    add('$schema','artifact_schema',true,'canonical supplier artifact v1','valid','Runtime schema and identity validated.');
  } catch (error) {
    add('$schema','artifact_schema',false,'canonical supplier artifact v1','invalid',error instanceof Error ? error.message : 'invalid artifact');
  }
  if (artifact) {
    const a = artifact;
    if (policy.schemaVersion === '2') for (const supplier of a.suppliers) {
      const check = verifySourceFacts(supplier,sources,policy.constraints);
      add('$source-facts:'+supplier.id,'source_facts',check.passed,'exact structured source facts and approved units',supplier,check.reason);
    }
    const sourceIds = a.suppliers.map(s => s.sourceId).sort();
    const expectedSourceIds = sources.map(s => s.id).sort();
    add('$sources','source_coverage',canonicalJson(sourceIds) === canonicalJson(expectedSourceIds),expectedSourceIds,sourceIds,'Demo profile requires exactly one supplier per source document; no silent omissions.');
    add('$dependencies','dependency_hash',hash(a.inputArtifactHashes) === hash(dependencyHashes),dependencyHashes,a.inputArtifactHashes,'Must consume every exact accepted predecessor artifact, with no extras.');
    if (policy.mode === 'extraction') {
      add('$extraction','extraction_shape',a.selectedSupplierId === null,null,a.selectedSupplierId,'Extraction does not choose a supplier.');
    } else {
      const predecessor = dependencies.values().next().value!;
      add('$facts','dependency_facts',hash(a.suppliers) === hash(predecessor.suppliers),hash(predecessor.suppliers),hash(a.suppliers),'Comparison cannot edit, omit or add accepted extracted supplier facts.');
    }
    const supplierChecks = a.suppliers.map(s => ({ supplier: s, checks: verifySupplier(s,sources,policy.constraints) }));
    const eligibleIds = supplierChecks.filter(s => eligible(s.checks)).map(s => s.supplier.id);
    for (const criterion of policy.criteria) {
      if (criterion.checker === 'selection') {
        const valid = a.selectedSupplierId === null ? eligibleIds.length === 0 : eligibleIds.includes(a.selectedSupplierId);
        add(criterion.id,'selection',valid,eligibleIds.length ? eligibleIds : null,a.selectedSupplierId,'Choose a demonstrably eligible option, or null only when none is established.');
      } else if (criterion.checker === 'dependency_hash') {
        add(criterion.id,'dependency_hash',hash(a.inputArtifactHashes) === hash(dependencyHashes),dependencyHashes,a.inputArtifactHashes,'Matches authoritative accepted-artifact context; hash alone is not an acceptance attestation.');
      } else if (criterion.checker === 'budget' || criterion.checker === 'delivery') {
        const selected = supplierChecks.find(s => s.supplier.id === a.selectedSupplierId);
        const result = selected?.checks.find(c => c.key === criterion.checker);
        const passed = a.selectedSupplierId === null ? eligibleIds.length === 0 : result?.passed === true;
        add(criterion.id,criterion.checker,passed,'selected supplier complies, or valid no-eligible result',a.selectedSupplierId,result?.reason ?? 'No eligible selection is supported only if no supplier passes all eligibility checks.');
      } else {
        for (const s of supplierChecks) {
          const result = s.checks.find(c => c.key === criterion.checker)!;
          const expected = criterion.checker === 'total_cost'
            ? (BigInt(s.supplier.unitPriceMinor) * BigInt(s.supplier.quantity) + BigInt(s.supplier.shippingMinor)).toString()
            : 'quotation present in frozen source';
          const actual = criterion.checker === 'total_cost'
            ? s.supplier.totalMinor : { sourceId: s.supplier.sourceId, quote: s.supplier.quote, matched: result.passed };
          add(criterion.id + ':' + s.supplier.id,criterion.checker,result.passed,expected,actual,result.reason);
        }
      }
    }
  }
  const allPassed = checks.every(c => c.passed);
  const body: ReportBody = {
    schemaVersion: '1', scope: 'deterministic_only', orderId: agreement.orderId, taskId: task.id,
    agreementHash, policyHash: hash(policy), sourceManifestHash: hash(sources),
    artifactHash: hashBytes(request.artifactBytes), artifactVersion, revision: request.revision,
    evaluatorAccountId: agreement.verifierAccountId, evaluatedAtNs: request.evaluatedAtNs,
    decision: allPassed ? 'accepted' : request.revision < task.maxRevisions ? 'revision_required' : 'rejected',
    checks,
    limitations: [
      'Deterministic result only: does not authorize a final on-chain verdict or settlement.',
      policy.schemaVersion === '2' ? 'Source facts are checked only against the strict structured fixture grammar; source authenticity and arbitrary prose semantics are not verified.' : 'Legacy v1: quotation presence does not prove numerical extraction, completeness of source facts or semantic truth.',
      'Evaluator account is declared metadata, not a cryptographic signature.',
      'Accepted dependency context must be loaded by the trusted service after chain reconciliation.'
    ]
  };
  return immutable({ report: body, reportHash: hash(body) });
}
// Integrity only, not authenticity. A caller can recompute a hash for altered content.
export function verifyReportIntegrity(input: unknown): boolean {
  try {
    const e = record(input, 'report envelope'); exactKeys(e, ['report','reportHash'], 'report envelope');
    digest(e.reportHash, 'report hash'); record(e.report, 'report');
    return hash(e.report) === e.reportHash;
  } catch { return false; }
}
