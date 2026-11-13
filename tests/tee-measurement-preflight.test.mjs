import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TEE_MEASUREMENTS} from '../packages/shared/src/tee-profiles.ts';
import {requireWorkerMeasurements} from '../scripts/tee-measurement-preflight.mjs';
const old='5fccdb6924dbbe7ab09a4ca412e1b264196e44c47c795774326da89a376e45c3';
test('measurement preflight rejects drift before signing; no authenticity authority',()=>{
 const b=JSON.parse(readFileSync(new URL('./fixtures/tee/extract.proof.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
 assert.equal(requireWorkerMeasurements(b.attestation.tdx_quote,old),old);
 const allowlist='ab0bbc0d27392a4c2a68968141b1ed38cae3e6a88a369d90552622d55b5e732d';
 assert.equal(requireWorkerMeasurements(b.attestation.tdx_quote,allowlist),old);
 const q=Buffer.from(b.attestation.tdx_quote,'base64');q[550]^=1;
 assert.throws(()=>requireWorkerMeasurements(q.toString('base64'),old),/differ/);
 assert.throws(()=>requireWorkerMeasurements(q.toString('base64'),allowlist),/differ/);
 q[0]=5;assert.throws(()=>requireWorkerMeasurements(q.toString('base64'),old),/layout/);
 assert.throws(()=>requireWorkerMeasurements('AAAA',old),/layout/);
});

test('v3 freezes exactly the two reviewed identities and preserves v1/v2 rejection boundaries',()=>{
 const [a,b,c]=['outlayer-tdx-direct-v1','outlayer-tdx-direct-v2','outlayer-tdx-direct-v3'].map(k=>TEE_MEASUREMENTS[k]);
 const commitment=createHash('sha256').update(Buffer.concat([Buffer.from('agent-work-worker-allowlist-v1\0'),Buffer.from(a,'hex'),Buffer.from(b,'hex')])).digest('hex');
 assert.equal(commitment,c);
 const fresh=JSON.parse(readFileSync(new URL('./fixtures/tee/worker-v2.proof.json',import.meta.url),'utf8'));
 assert.equal(requireWorkerMeasurements(fresh.attestation.tdx_quote,c),b);
 assert.equal(requireWorkerMeasurements(fresh.attestation.tdx_quote,b),b);
 assert.throws(()=>requireWorkerMeasurements(fresh.attestation.tdx_quote,a),/differ/);
});
