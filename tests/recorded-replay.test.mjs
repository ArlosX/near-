import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoConfig,artifactTemplate} from '../packages/orchestration/src/demo-data.ts';
import {canonicalJson,hash} from '../packages/agreements/src/agreement.ts';
import {verifySubmission} from '../packages/verification/src/report.ts';
import {validateRecordedReplay} from '../packages/model/src/recorded-replay.ts';
test('recorded-output replay preserves provenance and rejects changed policy, bytes, version or dependencies',()=>{
 const now=1794480000000000000n,source=createDemoConfig('recorded-source',now,'2500'),destination=createDemoConfig('new-destination',now,'2500');
 const bytes=canonicalJson(artifactTemplate('extract',1,source.suppliers,{},null));
 const report=verifySubmission({agreement:source.agreement,approvedAgreementHash:hash(source.agreement),taskId:'extract',policy:source.policies.extract,sources:source.sources,artifactBytes:bytes,revision:0,evaluatedAtNs:now.toString(),acceptedDependencies:[]});
 const completion={content:bytes,finishReason:'stop'};
 assert.equal(validateRecordedReplay(destination,source,report,bytes,completion,1,{}).execution,'recorded-model-output-replay');
 assert.throws(()=>validateRecordedReplay(destination,source,report,bytes+' ',completion,1,{}),/response differs/);
 assert.throws(()=>validateRecordedReplay(destination,source,report,bytes,completion,2,{}),/version/);
 assert.throws(()=>validateRecordedReplay(destination,source,report,bytes,completion,1,{extract:'sha256:'+'0'.repeat(64)}),/predecessor/);
 const changed=createDemoConfig('new-destination',now,'500');assert.throws(()=>validateRecordedReplay(changed,source,report,bytes,completion,1,{}),/policy/);
});
