import { atomic, exactKeys, identifier, invariant, record } from '../../shared/src/domain.ts';
import type { Criterion, Task } from '../../shared/src/domain.ts';
import type { Constraints, Source, Supplier } from './verify.ts';
import { canonicalJson, hash } from '../../agreements/src/agreement.ts';

export type Policy = {
  schemaVersion: '1' | '2'; taskId: string; mode: 'extraction' | 'comparison';
  constraints: Constraints; criteria: Criterion[];
};
export type Artifact = {
  schemaVersion: '1'; taskId: string; version: number;
  inputArtifactHashes: Record<string, string>;
  suppliers: Supplier[]; selectedSupplierId: string | null;
};
export function positiveInteger(value: unknown, label: string, max = 1000000): asserts value is number {
  invariant(Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= max, label + ': positive bounded integer required');
}
export function currency(value: unknown): asserts value is string {
  invariant(typeof value === 'string' && /^[A-Z]{3}$/.test(value), 'currency: uppercase three-letter code required');
}
export function validateSources(input: unknown): Source[] {
  invariant(Array.isArray(input) && input.length > 0 && input.length <= 20, 'source count must be 1–20');
  const ids = new Set<string>();
  for (const raw of input) {
    const source = record(raw, 'source'); exactKeys(source, ['id', 'text'], 'source'); identifier(source.id, 'source');
    invariant(!ids.has(source.id), 'duplicate source'); ids.add(source.id);
    invariant(typeof source.text === 'string' && source.text.trim().length > 0 && Buffer.byteLength(source.text, 'utf8') <= 100000, 'invalid/oversized source text');
  }
  return JSON.parse(canonicalJson(input)) as Source[];
}
export function validatePolicy(input: unknown, task: Task): Policy {
  const p = record(input, 'policy'); exactKeys(p, ['schemaVersion','taskId','mode','constraints','criteria'], 'policy');
  invariant((p.schemaVersion === '1' || p.schemaVersion === '2') && p.taskId === task.id, 'policy identity/version mismatch');
  invariant(p.mode === 'extraction' || p.mode === 'comparison', 'unsupported policy mode');
  invariant(p.mode === 'extraction' ? task.dependsOn.length === 0 : task.dependsOn.length === 1, 'unsupported dependency shape for demo profile');
  invariant(hash(p) === task.verificationPolicyHash, 'policy hash mismatch');
  invariant(canonicalJson(p.criteria) === canonicalJson(task.criteria), 'criteria differ from approved agreement');
  const c = record(p.constraints, 'constraints'); exactKeys(c, ['currency','quantity','budgetMinor','maxDeliveryDays'], 'constraints');
  currency(c.currency); positiveInteger(c.quantity, 'requested quantity'); atomic(c.budgetMinor, 'procurement budget');
  invariant(Number.isSafeInteger(c.maxDeliveryDays) && Number(c.maxDeliveryDays) >= 0 && Number(c.maxDeliveryDays) <= 3650, 'invalid delivery limit');
  const checkers = task.criteria.map(c => c.checker);
  const required = p.mode === 'extraction' ? ['source_quote','total_cost'] : ['source_quote','total_cost','selection','dependency_hash'];
  invariant(required.every(c => checkers.includes(c as Criterion['checker'])), 'policy omits mandatory demo checks');
  invariant(p.mode === 'comparison' || checkers.every(c => c === 'source_quote' || c === 'total_cost'), 'comparison-only checker in extraction policy');
  return JSON.parse(canonicalJson(p)) as Policy;
}
export function validateArtifact(input: unknown, taskId: string, version: number): Artifact {
  const a = record(input, 'artifact'); exactKeys(a, ['schemaVersion','taskId','version','inputArtifactHashes','suppliers','selectedSupplierId'], 'artifact');
  invariant(a.schemaVersion === '1' && a.taskId === taskId && a.version === version, 'artifact identity/version mismatch');
  const dependencies = record(a.inputArtifactHashes, 'input artifacts');
  invariant(Object.keys(dependencies).length <= 4, 'too many dependency artifacts');
  for (const [id, value] of Object.entries(dependencies)) {
    identifier(id, 'dependency'); invariant(typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value), 'invalid dependency hash');
  }
  invariant(Array.isArray(a.suppliers) && a.suppliers.length > 0 && a.suppliers.length <= 20, 'supplier count must be 1–20');
  const ids = new Set<string>();
  for (const raw of a.suppliers) {
    const s = record(raw, 'supplier');
    exactKeys(s, ['id','sourceId','quote','unitPriceMinor','quantity','shippingMinor','currency','deliveryDays','totalMinor'], 'supplier');
    identifier(s.id, 'supplier'); identifier(s.sourceId, 'supplier source');
    invariant(!ids.has(s.id), 'duplicate supplier'); ids.add(s.id);
    invariant(typeof s.quote === 'string' && s.quote.trim().length > 0 && Buffer.byteLength(s.quote, 'utf8') <= 10000, 'invalid quotation');
    atomic(s.unitPriceMinor, 'unit price'); atomic(s.shippingMinor, 'shipping'); atomic(s.totalMinor, 'total');
    positiveInteger(s.quantity, 'supplier quantity'); currency(s.currency);
    invariant(s.deliveryDays === null || (Number.isSafeInteger(s.deliveryDays) && Number(s.deliveryDays) >= 0 && Number(s.deliveryDays) <= 3650), 'invalid delivery value');
  }
  invariant(a.selectedSupplierId === null || (typeof a.selectedSupplierId === 'string' && ids.has(a.selectedSupplierId)), 'selection must reference a supplied supplier');
  return JSON.parse(canonicalJson(a)) as Artifact;
}
export function parseArtifact(bytes: string, taskId: string, version: number): Artifact {
  const parsed: unknown = JSON.parse(bytes);
  // Canonical input rejects ambiguous duplicate-key JSON and ensures one byte representation.
  invariant(canonicalJson(parsed) === bytes, 'artifact must use canonical JSON v1');
  return validateArtifact(parsed, taskId, version);
}
