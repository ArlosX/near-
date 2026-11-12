import {readFile} from 'node:fs/promises';
import {hash,hashBytes} from '../packages/agreements/src/agreement.ts';
// Source commitment for the local reference; deliberately not a WASM code hash.
const files=['packages/judge/src/local-judge.ts','packages/agreements/src/agreement.ts','packages/shared/src/domain.ts','packages/shared/src/json.ts','packages/verification/src/report.ts','packages/verification/src/policy.ts','packages/verification/src/verify.ts'];
export async function judgeSourceManifest(){
 const sources={};for(const path of files)sources[path]=hashBytes(await readFile(new URL('../'+path,import.meta.url),'utf8'));
 const manifest={kind:'local-node-reference-source',runtime:process.version,sources};
 return {manifest,codeHash:hash(manifest)};
}
