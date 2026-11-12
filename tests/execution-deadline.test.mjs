import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExecutionLifetime} from '../packages/shared/src/execution-deadline.ts';
import {LocalStore} from '../packages/database/src/local-store.ts';
import {LocalWorkflow} from '../packages/orchestration/src/local-workflow.ts';
test('six-hour new agreements are bounded and do not change an existing frozen cutoff',()=>{
 for(const value of [1,3600,21600])assert.equal(validateExecutionLifetime(value),value);
 for(const value of [0,-1,21601,1.5,NaN])assert.throws(()=>validateExecutionLifetime(value),/lifetime/);
 const store=new LocalStore(':memory:');try{const time=1794480000000000000n,flow=new LocalWorkflow(store,()=>time);const first=flow.create('original','2500',3600).value.orderId,cutoff=flow.details(first).config.agreement.resultCutoffNs;const second=flow.create('longer','2500',21600).value.orderId;assert.equal(flow.details(second).config.agreement.resultCutoffNs,(time+21600n*1000000000n).toString());assert.equal(flow.details(first).config.agreement.resultCutoffNs,cutoff);}finally{store.close();}
});
