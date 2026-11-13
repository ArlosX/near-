import {createHash, createPublicKey, randomBytes, verify} from 'node:crypto';
import {account, invariant, ValidationError} from '../../../packages/shared/src/domain.ts';
import {readJsonResponse} from '../../../packages/shared/src/json.ts';
import {record} from '../../../packages/shared/src/domain.ts';

type Challenge = {message:string; recipient:string; nonce:Buffer; callbackUrl:string; expires:number};
type Session = {accountId:string;publicKey:string;origin:string;expires:number;lastSeen:number;checkedAt:number;checking?:Promise<boolean>};
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function publicKeyBytes(key:string){
 const encoded=key.slice(8);
 invariant(key.startsWith('ed25519:')&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(encoded),'Unsupported wallet public key');
 let number=0n;
 for(const char of encoded)number=number*58n+BigInt(alphabet.indexOf(char));
 const hex=number.toString(16);
 const bytes=number===0n?Buffer.alloc(0):Buffer.from(hex.padStart(hex.length+(hex.length%2),'0'),'hex');
 const leading=encoded.match(/^1*/)?.[0].length??0;
 const decoded=Buffer.concat([Buffer.alloc(leading),bytes]);
 invariant(decoded.length===32,'Invalid wallet public key');
 return decoded;
}
function borshString(value:string){
 const bytes=Buffer.from(value),length=Buffer.alloc(4);
 length.writeUInt32LE(bytes.length);
 return Buffer.concat([length,bytes]);
}
export function walletDigest(challenge:Challenge){
 const tag=Buffer.alloc(4);
 tag.writeUInt32LE(2**31+413);
 // Popup sign-in requests omit callbackUrl from the signed NEP-413 payload.
 // The redirect destination still comes from the server-issued challenge.
 return createHash('sha256').update(Buffer.concat([tag,borshString(challenge.message),challenge.nonce,borshString(challenge.recipient),Buffer.of(0)])).digest();
}
async function isFullAccess(accountId:string,publicKey:string){
 const request=JSON.stringify({jsonrpc:'2.0',id:'wallet-auth',method:'query',params:{
  request_type:'view_access_key',finality:'final',account_id:accountId,public_key:publicKey
 }});
 for(const endpoint of ['https://rpc.testnet.fastnear.com','https://rpc.testnet.near.org']){
  try{
   const response=await fetch(endpoint,{
    method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(6000),
    redirect:'error',body:request
   });
   if(!response.ok)continue;
   const body=record(await readJsonResponse(response,65536),'wallet RPC response');
   invariant(body.jsonrpc==='2.0'&&body.id==='wallet-auth','Invalid wallet RPC envelope');
   const result=body.result as {permission?:unknown}|undefined;
   const error=body.error as {cause?:{name?:string}}|undefined;
   invariant(!(body.result&&body.error),'Ambiguous wallet RPC response');
   const permission=result?.permission;
   if(permission==='FullAccess')return true;
   if(permission&&typeof permission==='object'&&Object.hasOwn(permission,'FunctionCall')||['UNKNOWN_ACCESS_KEY','UNKNOWN_ACCOUNT'].includes(error?.cause?.name??''))return false;
  }catch{
   // Try the other provider when the request or response fails.
  }
 }
 throw new ValidationError('NEAR Testnet RPC unavailable');
}
export class WalletAuth {
 private challenges=new Map<string,Challenge>();
 private sessions=new Map<string,Session>();
 private checkKey:typeof isFullAccess;
 private now:()=>number;
 constructor(checkKey=isFullAccess,clock:()=>number=Date.now){this.checkKey=checkKey;this.now=clock;}
 issue(origin:string,previous?:string){
  if(previous)this.challenges.delete(previous);
  for(const [id,entry] of this.challenges)if(entry.expires<=this.now())this.challenges.delete(id);
  invariant(this.challenges.size<128,'Too many pending wallet challenges');
  const state=randomBytes(32).toString('hex');
  const challenge={message:'Sign in to Prooflane on Testnet. Challenge: '+state,recipient:origin,nonce:randomBytes(32),callbackUrl:origin+'/',expires:this.now()+300000};
  this.challenges.set(state,challenge);
  return {state,message:challenge.message,recipient:origin,nonce:challenge.nonce.toString('base64'),callbackUrl:challenge.callbackUrl};
 }
 async login(origin:string,cookie:string|undefined,input:Record<string,unknown>){
  const {state,accountId,publicKey,signature}=input;
  invariant(typeof state==='string'&&state===cookie,'Wallet challenge does not match this browser');
  const challenge=this.challenges.get(state);
  invariant(challenge&&challenge.recipient===origin&&challenge.expires>this.now(),'Wallet challenge expired or consumed');
  this.challenges.delete(state);
  account(accountId,'wallet account');
  invariant(typeof publicKey==='string'&&publicKey.length<=52&&typeof signature==='string'&&/^[A-Za-z0-9+/]{86}==$/.test(signature),'Invalid wallet proof');
  const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),publicKeyBytes(publicKey)]),type:'spki',format:'der'});
  invariant(verify(null,walletDigest(challenge),key,Buffer.from(signature,'base64')),'Invalid wallet signature');
  invariant(await this.checkKey(accountId,publicKey),'Wallet key is not a full-access Testnet key for this account');
  invariant(challenge.expires>this.now(),'Wallet challenge expired during verification');
  for(const [id,entry] of this.sessions)if(!this.alive(entry))this.sessions.delete(id);
  invariant(this.sessions.size<256,'Too many wallet sessions');
  const token=randomBytes(32).toString('hex');
  this.sessions.set(token,{accountId,publicKey,origin,expires:this.now()+3600000,lastSeen:this.now(),checkedAt:this.now()});
  return {token,accountId};
 }
 identity(token?:string){
  const session=token?this.sessions.get(token):undefined;
  if(session&&!this.alive(session)){this.sessions.delete(token!);return null;}
  return session?.accountId??null;
 }
 private alive(session:Session){return session.expires>this.now()&&this.now()-session.lastSeen<15*60*1000;}
 async authorize(token:string|undefined,origin:string,force=false){
  const session=token?this.sessions.get(token):undefined;
  if(!session||!this.alive(session)){if(token)this.sessions.delete(token);return null;}
  if(session.origin!==origin)return null;
  if(force||this.now()-session.checkedAt>=60000){
   // Coalesce parallel checks; never authorize from a failed/stale RPC response.
   const checking=session.checking??this.checkKey(session.accountId,session.publicKey);
   session.checking=checking;
   let allowed:boolean;
   try{allowed=await checking;}finally{if(session.checking===checking)delete session.checking;}
   if(this.sessions.get(token!)!==session||!this.alive(session))return null;
   if(!allowed){
    for(const [id,entry]of this.sessions)if(entry.accountId===session.accountId&&entry.publicKey===session.publicKey)this.sessions.delete(id);
    return null;
   }
   session.checkedAt=this.now();
  }
  session.lastSeen=this.now();return session.accountId;
 }
 logout(token?:string){if(token)this.sessions.delete(token);}
}
