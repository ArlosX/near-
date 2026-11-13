import { createHash } from 'node:crypto';
import { account, atomic, digest, exactKeys, identifier, invariant, record, U64_MAX } from '../../shared/src/domain.ts';
import type { Agreement, Task } from '../../shared/src/domain.ts';

// Project canonical JSON v1: plain JSON, lexically sorted keys, no Unicode normalization.
// Not a claim of RFC 8785 compliance. Reject unsupported values rather than lose data.
export function canonicalJson(value: unknown): string {
  return encodeCanonical(value, 0);
}
function encodeCanonical(value: unknown, depth: number): string {
  invariant(depth <= 64, 'canonical JSON depth exceeds 64');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    invariant(Number.isSafeInteger(value) && !Object.is(value, -0), 'only safe integer JSON numbers supported');
    return String(value);
  }
  if (Array.isArray(value)) {
    invariant(Object.keys(value).length === value.length && Object.getOwnPropertyNames(value).length === value.length + 1 && Object.getOwnPropertySymbols(value).length === 0, 'sparse or decorated arrays unsupported');
    const items: string[] = [];
    for (let i = 0; i < value.length; i++) {
      const property = Object.getOwnPropertyDescriptor(value, String(i));
      invariant(property && 'value' in property, 'sparse or accessor arrays unsupported');
      items.push(encodeCanonical(property.value, depth + 1));
    }
    return '[' + items.join(',') + ']';
  }
  const obj = record(value, 'canonical JSON');
  invariant(Object.getOwnPropertySymbols(obj).length === 0, 'symbol keys unsupported');
  invariant(Object.getOwnPropertyNames(obj).length === Object.keys(obj).length, 'hidden properties unsupported');
  return '{' + Object.keys(obj).sort().map(k => {
    const property = Object.getOwnPropertyDescriptor(obj, k)!;
    invariant('value' in property, 'accessor properties unsupported');
    return JSON.stringify(k) + ':' + encodeCanonical(property.value, depth + 1);
  }).join(',') + '}';
}
export function hash(value: unknown): string {
  return hashBytes(canonicalJson(value));
}
export function hashBytes(bytes: string): string {
  return 'sha256:' + createHash('sha256').update(bytes, 'utf8').digest('hex');
}
export function validateAgreement(input: unknown, nowNs: bigint): Agreement {
  const a = record(input, 'agreement');
  exactKeys(a, ['schemaVersion','network','contractId','orderId','clientAccountId','verifierAccountId','asset','totalAmountAtomic','resultCutoffNs','sourceManifestHash','settlement','failure','tasks'], 'agreement');
  invariant(a.schemaVersion === '1.2' && a.network === 'testnet', 'unsupported schema/network');
  invariant(a.asset === 'NEAR' && a.settlement === 'full_parent_success' && a.failure === 'full_client_refund', 'unsupported economic policy');
  account(a.contractId, 'contract'); account(a.clientAccountId, 'client'); account(a.verifierAccountId, 'verifier'); identifier(a.orderId, 'order');
  digest(a.sourceManifestHash, 'source manifest');
  const total = atomic(a.totalAmountAtomic, 'total'); invariant(total > 0n, 'positive total required');
  invariant(atomic(a.resultCutoffNs, 'cutoff', U64_MAX) > nowNs, 'cutoff must be in future');
  invariant(Array.isArray(a.tasks) && a.tasks.length >= 2 && a.tasks.length <= 5, '2–5 tasks required');
  let sum = 0n;
  const ids = new Set<string>();
  for (const raw of a.tasks) {
    const t = record(raw, 'task');
    exactKeys(t, ['id','agentId','runtimeVersion','recipientAccountId','amountAtomic','required','dependsOn','maxRevisions','criteria','verificationPolicyHash'], 'task');
    identifier(t.id, 'task'); invariant(!ids.has(t.id), 'duplicate task'); ids.add(t.id);
    digest(t.verificationPolicyHash, 'verification policy');
    identifier(t.agentId, 'agent'); identifier(t.runtimeVersion, 'runtime'); account(t.recipientAccountId, 'recipient');
    const amount = atomic(t.amountAtomic, 'allocation'); invariant(amount > 0n, 'positive allocation required'); sum += amount;
    invariant(t.required === true, 'all funded tasks must be required');
    invariant(Number.isInteger(t.maxRevisions) && Number(t.maxRevisions) >= 0 && Number(t.maxRevisions) <= 3, 'revision cap must be 0–3');
    invariant(Array.isArray(t.dependsOn) && t.dependsOn.length <= 4, 'dependencies required');
    t.dependsOn.forEach(d => identifier(d, 'dependency'));
    invariant(new Set(t.dependsOn).size === t.dependsOn.length && !t.dependsOn.includes(t.id), 'invalid dependency');
    invariant(Array.isArray(t.criteria) && t.criteria.length > 0 && t.criteria.length <= 16, 'criteria required');
    const criteria = new Set<string>();
    for (const rawCriterion of t.criteria) {
      const c = record(rawCriterion, 'criterion'); exactKeys(c, ['id','checker','version'], 'criterion'); identifier(c.id, 'criterion');
      invariant(!criteria.has(c.id), 'duplicate criterion'); criteria.add(c.id);
      invariant(c.version === 1 && typeof c.checker === 'string' && ['source_quote','total_cost','budget','delivery','selection','dependency_hash'].includes(String(c.checker)), 'unknown checker/version');
    }
  }
  invariant(sum === total, 'allocation total mismatch');
  const tasks = a.tasks as Task[];
  const visited = new Set<string>(); const visiting = new Set<string>();
  function visit(id: string) {
    invariant(!visiting.has(id), 'dependency cycle'); if (visited.has(id)) return;
    const t = tasks.find(t => t.id === id); invariant(t, 'unknown dependency'); visiting.add(id);
    for (const predecessor of t.dependsOn) visit(predecessor);
    visiting.delete(id); visited.add(id);
  }
  tasks.forEach(t => visit(t.id));
  invariant(tasks.some(t => t.dependsOn.length > 0), 'dependent workflow required');
  // Copy and recursively freeze the approved snapshot. Database immutability still needs service enforcement.
  return deepFreeze(JSON.parse(canonicalJson(a)) as Agreement);
}
export function fundingIntent(agreement: Agreement, verificationMode?: 'outlayer-tdx-direct-v1'|'outlayer-tdx-direct-v2'|'outlayer-tdx-direct-v3') {
  invariant(verificationMode === undefined || (verificationMode === 'outlayer-tdx-direct-v1' || verificationMode === 'outlayer-tdx-direct-v2' || verificationMode === 'outlayer-tdx-direct-v3'), 'Unsupported funding verification mode');
  if (verificationMode) return {
    network: agreement.network, signerId: agreement.clientAccountId, receiverId: agreement.contractId,
    methodName: 'create_tee_work_order', depositAtomic: agreement.totalAmountAtomic,
    args: {agreement_json: canonicalJson(agreement)}
  };
  return {
    network: agreement.network, signerId: agreement.clientAccountId, receiverId: agreement.contractId, methodName: 'create_work_order',
    depositAtomic: agreement.totalAmountAtomic,
    args: {
      order_id: agreement.orderId, agreement_hash: hash(agreement), verifier: agreement.verifierAccountId,
      cutoff_ns: agreement.resultCutoffNs,
      tasks: agreement.tasks.map(t => ({ id: t.id, recipient: t.recipientAccountId, amount: t.amountAtomic, depends_on: [...t.dependsOn] }))
    }
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}
