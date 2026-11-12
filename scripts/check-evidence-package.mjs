import {readFile,stat} from 'node:fs/promises';
import {hash,hashBytes} from '../packages/agreements/src/agreement.ts';
import {parseJsonStrict} from '../packages/shared/src/json.ts';
import {verifyReportIntegrity} from '../packages/verification/src/report.ts';
import {invariant} from '../packages/shared/src/domain.ts';
const filename=process.argv[2];invariant(filename,'Usage: node scripts/check-evidence-package.mjs FILE.json');
invariant((await stat(filename)).size<=16*1024*1024,'Package exceeds 16 MiB');
const bytes=await readFile(filename);invariant(bytes.length<=16*1024*1024,'Package exceeds 16 MiB');
const bundle=parseJsonStrict(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),c=bundle.content;
invariant(c?.schemaVersion==='1'&&c.kind==='agent-work-evidence','Unknown evidence schema');
invariant(hash(c)===bundle.packageHash,'Package hash mismatch');
invariant(hash(c.agreement)===c.agreementHash&&c.orderId===c.agreement.orderId,'Agreement binding mismatch');
invariant(hash(c.sources)===c.agreement.sourceManifestHash,'Source binding mismatch');
invariant(Array.isArray(c.deliveries),'Missing deliveries');
for(const d of c.deliveries){
 const task=c.agreement.tasks.find(task=>task.id===d.taskId),r=d.report?.report;
 invariant(task&&r&&verifyReportIntegrity(d.report),'Invalid task/report');
 invariant(d.agentId===task.agentId&&d.policyHash===task.verificationPolicyHash&&hash(c.policies[task.id])===d.policyHash&&hash(task.criteria)===d.criteriaHash,'Policy/identity binding mismatch');
 invariant(d.agreementHash===c.agreementHash&&r.agreementHash===c.agreementHash&&r.orderId===c.orderId&&r.taskId===d.taskId&&r.artifactVersion===d.outputVersion&&r.policyHash===d.policyHash,'Report context mismatch');
 invariant(hashBytes(d.artifactBytes)===d.fileHash&&r.artifactHash===d.fileHash,'Output hash mismatch');
}
console.log(JSON.stringify({orderId:c.orderId,deliveries:c.deliveries.length,integrity:'consistent',authenticity:'not-proven',tee:'not-verified',payment:'not-verified',note:'Hash consistency is not a signature, semantic verification, independent timestamp or chain receipt.'},null,2));
