import {canonicalJson} from '../../agreements/src/agreement.ts';
import {invariant} from '../../shared/src/domain.ts';
import {parseJsonStrict} from '../../shared/src/json.ts';

// Normalize presentation only. Preserve malformed, ambiguous or unsupported
// input verbatim so verification records a failure instead of silently repairing it.
export function modelArtifactBytes(content:string):string {
 try {
  invariant(Buffer.byteLength(content,'utf8')<=1000000,'artifact too large');
  const value=parseJsonStrict(content);
  return canonicalJson(value);
 }catch{return content;}
}
