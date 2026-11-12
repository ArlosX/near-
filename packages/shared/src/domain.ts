export type Criterion = {
  id: string;
  checker: 'source_quote' | 'total_cost' | 'budget' | 'delivery' | 'selection' | 'dependency_hash';
  version: 1;
};
export type Task = {
  id: string;
  agentId: string;
  runtimeVersion: string;
  recipientAccountId: string;
  amountAtomic: string;
  required: true;
  dependsOn: string[];
  maxRevisions: number;
  criteria: Criterion[];
  verificationPolicyHash: string;
};
export type Agreement = {
  schemaVersion: '1.2';
  network: 'testnet';
  contractId: string;
  orderId: string;
  clientAccountId: string;
  verifierAccountId: string;
  asset: 'NEAR';
  totalAmountAtomic: string;
  resultCutoffNs: string;
  sourceManifestHash: string;
  settlement: 'full_parent_success';
  failure: 'full_client_refund';
  tasks: Task[];
};
export class ValidationError extends Error {}
export function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new ValidationError(message);
}
export function record(value: unknown, label: string): Record<string, unknown> {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), `${label}: object required`);
  const prototype = Object.getPrototypeOf(value);
  invariant(prototype === Object.prototype || prototype === null, `${label}: plain object required`);
  return value as Record<string, unknown>;
}
export function exactKeys(value: Record<string, unknown>, keys: string[], label: string) {
  invariant(Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), `${label}: unexpected or missing field`);
}
export function identifier(value: unknown, label: string): asserts value is string {
  invariant(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value), `${label}: invalid identifier`);
}
export function account(value: unknown, label: string): asserts value is string {
  invariant(typeof value === 'string' && value.length >= 2 && value.length <= 64 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value), `${label}: invalid NEAR account`);
}
export const U128_MAX = (1n << 128n) - 1n;
export const U64_MAX = (1n << 64n) - 1n;
export function atomic(value: unknown, label: string, max = U128_MAX): bigint {
  invariant(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 39, `${label}: canonical unsigned integer string required`);
  const amount = BigInt(value);
  invariant(amount <= max, `${label}: integer overflow`);
  return amount;
}
export function digest(value: unknown, label: string): asserts value is string {
  invariant(typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value), `${label}: invalid digest`);
}
