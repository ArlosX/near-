import test from 'node:test';
import assert from 'node:assert/strict';
import {operatorRun} from '../packages/shared/src/operator-run.ts';
test('new operator runs preserve historical evidence and cannot escape their artifact directory',()=>{
 assert.equal(operatorRun({}).name,'stage6-success');assert.equal(operatorRun({NEAR_WORK_RUN:'stage6-success-final'}).name,'stage6-success-final');
 for(const name of ['../stage6-success','stage6-success/../outside','D:\\outside','stage6-success-abc/def'])assert.throws(()=>operatorRun({NEAR_WORK_RUN:name}),/run name/);
 assert.notEqual(operatorRun({}).folder,operatorRun({NEAR_WORK_RUN:'stage6-success-final'}).folder);
});
