import { verifySupplier, eligible } from '../packages/verification/src/verify.ts';
const sources = [{ id: 'demo', text: 'SYNTHETIC FIXTURE: unit price 1000; shipping 100; delivery 3 days.' }];
const constraints = { currency: 'USD', quantity: 2, budgetMinor: '2500', maxDeliveryDays: 7 };
const item = { id: 'a', sourceId: 'demo', quote: 'unit price 1000', unitPriceMinor: '1000', quantity: 2, shippingMinor: '100', currency: 'USD', deliveryDays: 3, totalMinor: '999' };
console.log('FIXTURE ONLY: no AI, chain transaction, or autonomous correction.');
for (const [label,total] of [['bad arithmetic','999'],['manually corrected fixture','2100']]) {
 const checks = verifySupplier({...item,totalMinor:total!},sources,constraints);
 console.log(JSON.stringify({label,eligible:eligible(checks),checks},null,2));
}
