import { atomic, invariant } from '../../shared/src/domain.ts';
export type Source = { id: string; text: string };
export type Supplier = {
  id: string; sourceId: string; quote: string;
  unitPriceMinor: string; quantity: number; shippingMinor: string;
  currency: string; deliveryDays: number | null; totalMinor: string;
};
export type Check = { key: string; passed: boolean; reason: string };
export type Constraints = { currency: string; quantity: number; budgetMinor: string; maxDeliveryDays: number };
// Profile v2 accepts only this explicit fixture grammar. Arbitrary prose is not
// semantically verified. Currency and quantity are defined by the frozen policy.
export function verifySourceFacts(supplier: Supplier, sources: Source[], constraints: Constraints): Check {
  const source = sources.find(s => s.id === supplier.sourceId);
  const match = source?.text.match(/^[A-Za-z][A-Za-z0-9 _-]{0,63}: unit price (0|[1-9][0-9]{0,38}), shipping (0|[1-9][0-9]{0,38}), delivery (?:(0|[1-9][0-9]{0,3}) days|unknown)\.$/);
  const passed = Boolean(match && supplier.unitPriceMinor === match[1] && supplier.shippingMinor === match[2] &&
    supplier.deliveryDays === (match[3] === undefined ? null : Number(match[3])) &&
    supplier.currency === constraints.currency && supplier.quantity === constraints.quantity);
  return {key:'source_facts',passed,reason:'Profile v2 requires exact price, shipping and delivery from the entire structured fixture source, and approved currency/quantity. Unsupported or instruction-appended prose fails closed.'};
}
export function verifySupplier(supplier: Supplier, sources: Source[], constraints: Constraints): Check[] {
  invariant(Number.isSafeInteger(supplier.quantity) && supplier.quantity > 0, 'invalid quantity');
  invariant(Number.isSafeInteger(constraints.quantity) && constraints.quantity > 0, 'invalid requested quantity');
  invariant(Number.isSafeInteger(constraints.maxDeliveryDays) && constraints.maxDeliveryDays >= 0, 'invalid delivery constraint');
  invariant(supplier.deliveryDays === null || (Number.isSafeInteger(supplier.deliveryDays) && supplier.deliveryDays >= 0), 'invalid delivery value');
  const expected = atomic(supplier.unitPriceMinor, 'unit price') * BigInt(supplier.quantity) + atomic(supplier.shippingMinor, 'shipping');
  const total = atomic(supplier.totalMinor, 'total'); const budget = atomic(constraints.budgetMinor, 'budget');
  const source = sources.find(s => s.id === supplier.sourceId);
  return [
    { key: 'source_quote', passed: typeof supplier.quote === 'string' && supplier.quote.trim().length > 0 && Boolean(source?.text.includes(supplier.quote)), reason: 'Checks quotation presence only; not truth or numerical extraction accuracy.' },
    { key: 'total_cost', passed: total === expected, reason: `Expected ${expected} minor units from supplied values.` },
    { key: 'budget', passed: supplier.currency === constraints.currency && supplier.quantity === constraints.quantity && total === expected && expected <= budget, reason: 'Requires matching currency/quantity and reproducible total within budget.' },
    { key: 'delivery', passed: supplier.deliveryDays !== null && supplier.deliveryDays <= constraints.maxDeliveryDays, reason: 'Unknown delivery never establishes eligibility.' }
  ];
}
// Ineligibility is a business result, not necessarily failed agent work.
export function eligible(checks: Check[]): boolean { return checks.every(c => c.passed); }
export function verifyDependency(actualHash: string, acceptedHash: string): Check {
  return { key: 'dependency_hash', passed: actualHash === acceptedHash, reason: 'Must consume exact accepted predecessor artifact.' };
}
