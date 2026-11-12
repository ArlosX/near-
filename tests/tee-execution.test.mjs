import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,hashBytes} from '../packages/agreements/src/agreement.ts';
import {TEE_CODE} from '../packages/agreements/src/tee-settlement.ts';
import {teeExecutionIntent} from '../packages/agreements/src/tee-execution.ts';
const inner='{}',input=canonicalJson({inputBytes:inner,expectedInputHash:hashBytes(inner),expectedCodeHash:'sha256:'+TEE_CODE});
test('OutLayer execution pins code, resource budget and exact committed input',()=>{
 const i=teeExecutionIntent(input,'owner.testnet','4000100000000000000000');
 assert.equal(i.args.input_data,input);assert.equal(i.args.source.WasmUrl.hash,TEE_CODE);assert.equal(i.receiverId,'outlayer.testnet');assert.equal(i.gasTgas,100);assert.equal(i.depositAtomic,'4000100000000000000000');
 assert.throws(()=>teeExecutionIntent(input,'owner.testnet','10000000000000000000001'),/budget/);
 for(const cost of [0,'0','1.0','01','-1',{}])assert.throws(()=>teeExecutionIntent(input,'owner.testnet',cost),/estimate/);
 assert.throws(()=>teeExecutionIntent(input.replace(hashBytes(inner),'sha256:'+'0'.repeat(64)),'owner.testnet','1'),/commitment/);
});
