import {StorageClient} from '@supabase/storage-js';
import {hashBytes} from '../../agreements/src/agreement.ts';
import {digest,invariant} from '../../shared/src/domain.ts';
export const EVIDENCE_BUCKET='near-work-evidence';
export type EvidenceRef={key:string;hash:string;size:number};
export interface EvidenceStorage{put(scope:string,bytes:string):Promise<EvidenceRef>;get(key:string,expectedHash:string):Promise<string>}
function validKey(key:string){invariant(/^[a-zA-Z0-9_-]+\/(sources|artifacts|reports)\/[a-zA-Z0-9_/-]+\.json$/.test(key)&&!key.includes('..'),'invalid evidence path');}
export class SupabaseEvidenceStorage implements EvidenceStorage{
 private client:StorageClient;
 constructor(client:StorageClient){this.client=client;}
 async ensureBucket(){
  const found=await this.client.getBucket(EVIDENCE_BUCKET);
  if(found.error){
   invariant(String(found.error.status)==='404'||String((found.error as {statusCode?:string}).statusCode)==='404','Cannot inspect evidence bucket');
   const created=await this.client.createBucket(EVIDENCE_BUCKET,{public:false,fileSizeLimit:1000000,allowedMimeTypes:['application/json']});invariant(!created.error,'Cannot create private evidence bucket');
  }
  const checked=await this.client.getBucket(EVIDENCE_BUCKET);invariant(!checked.error&&checked.data&&!checked.data.public,'Evidence bucket must be private');
  invariant(Number(checked.data.file_size_limit)>0&&Number(checked.data.file_size_limit)<=1000000,'Evidence bucket size limit must be at most 1MB');
 }
 async put(scope:string,bytes:string){
  const size=Buffer.byteLength(bytes,'utf8');invariant(size<=1000000,'evidence exceeds 1MB');const hash=hashBytes(bytes),key=scope+'/'+hash.slice(7)+'.json';validKey(key);
  // No overwrite. A retry may reuse an object only after verifying its actual bytes.
  await this.client.from(EVIDENCE_BUCKET).upload(key,Buffer.from(bytes,'utf8'),{contentType:'application/json',upsert:false,cacheControl:'0'});
  const stored=await this.get(key,hash);invariant(stored===bytes,'stored evidence bytes mismatch');return {key,hash,size};
 }
 async get(key:string,expectedHash:string){
  validKey(key);digest(expectedHash,'evidence hash');
  const result=await this.client.from(EVIDENCE_BUCKET).download(key);invariant(!result.error&&result.data,'Private evidence unavailable');
  invariant(result.data.size<=1000000,'evidence exceeds 1MB');
  const bytes=Buffer.from(await result.data.arrayBuffer());
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new Error('Invalid evidence UTF-8');}
  invariant(hashBytes(text)===expectedHash,'evidence hash mismatch');return text;
 }
}
export function createEvidenceStorage(env:NodeJS.ProcessEnv=process.env){
 invariant(env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY,'Supabase Storage server configuration missing');
 let url:URL;try{url=new URL(env.SUPABASE_URL);}catch{throw new Error('Invalid Supabase Storage URL');}
 invariant(url.protocol==='https:'&&url.hostname.endsWith('.supabase.co')&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash,'Invalid Supabase Storage endpoint');
 const key=env.SUPABASE_SERVICE_ROLE_KEY;
 const boundedFetch:typeof fetch=async(input,init)=>fetch(input,{...init,redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(15000),...(init?.signal?[init.signal]:[])])});
 return new SupabaseEvidenceStorage(new StorageClient(url.origin+'/storage/v1',{apikey:key,Authorization:'Bearer '+key},boundedFetch));
}
