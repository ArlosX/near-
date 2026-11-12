import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseEvidenceStorage,createEvidenceStorage} from '../packages/database/src/evidence-storage.ts';
import {hashBytes} from '../packages/agreements/src/agreement.ts';
function fixture(){const files=new Map();let uploadFailure=false;const client={getBucket:async()=>({data:{public:false,file_size_limit:1000000},error:null}),from:()=>({upload:async(key,data)=>{if(uploadFailure)return {error:{message:'offline'}};if(!files.has(key))files.set(key,Buffer.from(data));return {error:null};},download:async key=>files.has(key)?{data:new Blob([files.get(key)]),error:null}:{data:null,error:{message:'not found'}}})};return {store:new SupabaseEvidenceStorage(client),files,client,fail:()=>{uploadFailure=true;}};}
test('private evidence preserves UTF-8 exact bytes and retries without overwriting',async()=>{const {store,files}=fixture();await store.ensureBucket();const bytes='{"text":"شاهد فارسی"}',one=await store.put('order/artifacts/extract/1',bytes),two=await store.put('order/artifacts/extract/1',bytes);assert.deepEqual(one,two);assert.equal(files.size,1);assert.equal(await store.get(one.key,hashBytes(bytes)),bytes);});
test('tampered or missing object fails closed',async()=>{const {store,files}=fixture();const ref=await store.put('order/reports/extract/1','{}');files.set(ref.key,Buffer.from('changed'));await assert.rejects(()=>store.get(ref.key,ref.hash),/hash mismatch/);files.clear();await assert.rejects(()=>store.get(ref.key,ref.hash),/unavailable/);});
test('upload failure cannot produce a successful evidence reference',async()=>{const f=fixture();f.fail();await assert.rejects(()=>f.store.put('order/sources','{}'),/unavailable/);});
test('public bucket, oversize content and traversal are rejected',async()=>{const f=fixture();f.client.getBucket=async()=>({data:{public:true,file_size_limit:1000000},error:null});await assert.rejects(()=>f.store.ensureBucket(),/private/);await assert.rejects(()=>f.store.put('order/sources','x'.repeat(1000001)),/1MB/);await assert.rejects(()=>f.store.put('../sources','{}'),/invalid evidence path/);});
test('storage config rejects non-Supabase endpoints and absent credentials',()=>{assert.throws(()=>createEvidenceStorage({}),/configuration missing/);assert.throws(()=>createEvidenceStorage({SUPABASE_URL:'https://example.com',SUPABASE_SERVICE_ROLE_KEY:'never-forward'}),/endpoint/);});

test('malformed UTF-8 cannot impersonate the hash of a replacement character',async()=>{
 const f=fixture(),ref=await f.store.put('order/sources','\ufffd');
 f.files.set(ref.key,Buffer.from([0xff]));
 await assert.rejects(()=>f.store.get(ref.key,ref.hash));
});
