import {createHash} from 'node:crypto';
import {TEE_MEASUREMENTS} from '../packages/shared/src/tee-profiles.ts';
// A rejection-only preflight. Parsing a measurement never authenticates a quote;
// Intel signature and exact request verification remain mandatory in escrow.
export function requireWorkerMeasurements(base64,expected){
 if(typeof base64!=='string'||! /^[a-f0-9]{64}$/.test(expected))throw Error('Invalid measurement preflight input');
 const quote=Buffer.from(base64,'base64');
 if(quote.toString('base64')!==base64||quote.length<632||quote.readUInt16LE(0)!==4||quote.readUInt32LE(4)!==0x81)throw Error('Unsupported TDX quote layout');
 const digest=createHash('sha256').update(Buffer.concat([quote.subarray(184,232),quote.subarray(376,568)])).digest('hex');
 const allowed=expected===TEE_MEASUREMENTS['outlayer-tdx-direct-v3']
  ? [TEE_MEASUREMENTS['outlayer-tdx-direct-v1'],TEE_MEASUREMENTS['outlayer-tdx-direct-v2']]:[expected];
 if(!allowed.includes(digest))throw Error('Worker measurements differ from frozen escrow profile; do not submit this proof');
 return digest;
}
