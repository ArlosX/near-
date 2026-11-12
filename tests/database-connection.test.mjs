import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createDatabasePool} from '../packages/database/src/connection.ts';
test('checked-out provider connection resets do not become unhandled process errors or disclose credentials',async()=>{
 const pool=createDatabasePool({DATABASE_URL:'postgresql://postgres:example-password@demo.supabase.co:5432/postgres'}),client=new EventEmitter(),messages=[],original=console.error;
 try{console.error=message=>messages.push(String(message));pool.emit('connect',client);assert.doesNotThrow(()=>client.emit('error',Error('postgresql://SECRET@PRIVATE-HOST')));assert.ok(messages.length);assert.doesNotMatch(messages.join('\n'),/SECRET|PRIVATE-HOST/);assert.equal(pool.options.max,2);assert.throws(()=>createDatabasePool({DATABASE_URL:'postgresql://u:p@demo.supabase.co/postgres',DATABASE_POOL_MAX:'9'}),/POOL_MAX/);}finally{console.error=original;await pool.end();}
});
