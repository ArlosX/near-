import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalJson } from '../packages/agreements/src/agreement.ts';
import { verifySubmission } from '../packages/verification/src/report.ts';
import { fixture, editArtifact } from '../tests/fixtures/verification.mjs';
console.log('SYNTHETIC FIXTURE: manual correction, no AI, database, chain or signed verdict.');
const directory=resolve(import.meta.dirname,'../artifacts/local/verification-demo');
await mkdir(directory,{recursive:true});
const request=editArtifact(fixture(),a=>a.suppliers[0].totalMinor='999');
const failed=verifySubmission(request);
request.revision=1;editArtifact(request,a=>{a.version=2;a.suppliers[0].totalMinor='2100';});
const repaired=verifySubmission(request);
const noEligible=fixture('comparison','500');editArtifact(noEligible,a=>a.selectedSupplierId=null);
const reports=[['01-failed',failed],['02-repaired',repaired],['03-no-eligible',verifySubmission(noEligible)]];
for(const [name,envelope] of reports){
 await writeFile(resolve(directory,name+'.json'),canonicalJson(envelope)+'\n');
 console.log(JSON.stringify({scenario:name,decision:envelope.report.decision,artifactVersion:envelope.report.artifactVersion,reportHash:envelope.reportHash,failedChecks:envelope.report.checks.filter(c=>!c.passed)}));
}
console.log('Inspect report JSON at '+directory);
