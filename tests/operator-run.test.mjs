import test from 'node:test';
import assert from 'node:assert/strict';
import {operatorRun} from '../packages/shared/src/operator-run.ts';
test('new operator runs preserve historical evidence and cannot escape their artifact directory',()=>{
 assert.equal(operatorRun({}).name,'stage6-success');assert.equal(operatorRun({NEAR_WORK_RUN:'stage6-success-final'}).name,'stage6-success-final');
 for(const name of ['../stage6-success','stage6-success/../outside','D:\\outside','stage6-success-abc/def'])assert.throws(()=>operatorRun({NEAR_WORK_RUN:name}),/run name/);
 assert.notEqual(operatorRun({}).folder,operatorRun({NEAR_WORK_RUN:'stage6-success-final'}).folder);
 const v2=operatorRun({NEAR_WORK_RUN:'stage6-success-live-v2',NEAR_WORK_ACTOR:'arlosxq.testnet',NEAR_WORK_PROFILE:'outlayer-tdx-direct-v2'});
 assert.equal(v2.contract,'agentwork-tee-v2-arlosxq.testnet');assert.notEqual(v2.codeHash,operatorRun({}).codeHash);
 assert.throws(()=>operatorRun({NEAR_WORK_PROFILE:'outlayer-tdx-direct-v2'}),/separate run/);
 assert.throws(()=>operatorRun({NEAR_WORK_PROFILE:'unknown'}),/profile/);
 const v3=operatorRun({NEAR_WORK_RUN:'stage6-success-live-v3',NEAR_WORK_ACTOR:'arlosxq.testnet',NEAR_WORK_PROFILE:'outlayer-tdx-direct-v3'});
 assert.equal(v3.contract,v2.contract);assert.notEqual(v3.codeHash,v2.codeHash);
 assert.throws(()=>operatorRun({NEAR_WORK_RUN:'stage6-success-live-v2-final',NEAR_WORK_ACTOR:'arlosxq.testnet',NEAR_WORK_PROFILE:'outlayer-tdx-direct-v3'}),/separate run/);
});
