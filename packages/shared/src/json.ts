import {invariant} from './domain.ts';

// JSON.parse accepts duplicate keys. Reject ambiguity (including escaped-key
// aliases) before the parsed value can influence an authorization decision.
export function parseJsonStrict(text:string):unknown {
 const value:unknown=JSON.parse(text);
 const stack:{object:boolean;key:boolean;keys:Set<string>}[]=[];
 for(const token of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\],:]/g)){
  const item=token[0],top=stack.at(-1);
  if(item==='{'||item==='['){stack.push({object:item==='{',key:item==='{',keys:new Set()});invariant(stack.length<=64,'JSON depth exceeds 64');}
  else if(item==='}'||item===']')stack.pop();
  else if(item===','){if(top?.object)top.key=true;}
  else if(item.startsWith('"')&&top?.object&&top.key){
   const key=JSON.parse(item) as string;invariant(!top.keys.has(key),'duplicate JSON key');top.keys.add(key);top.key=false;
  }
 }
 return value;
}

// Callers supply a fetch AbortSignal deadline; this additionally bounds decoded
// response bytes (including chunked/compressed bodies) and always releases streams.
export async function readJsonResponse(response:Response,maxBytes:number):Promise<unknown>{
 invariant(Number.isSafeInteger(maxBytes)&&maxBytes>0,'invalid response limit');
 const reader=response.body?.getReader();invariant(reader,'empty JSON response');
 const chunks:Uint8Array[]=[];let size=0;
 try{
  const length=response.headers.get('content-length');
  invariant(length===null||/^\d+$/.test(length)&&Number(length)<=maxBytes,'JSON response too large');
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;invariant(size<=maxBytes,'JSON response too large');chunks.push(value);}
  const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
  return parseJsonStrict(text);
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
