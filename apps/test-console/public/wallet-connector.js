// Intear V3 direct-popup wire protocol. Browser WebCrypto authenticates only
// this ephemeral connection; the server separately verifies the wallet NEP-413
// proof and finalized Testnet key ownership. No on-chain access key is requested.
export const INTEAR_ORIGIN='https://wallet.intear.tech';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes){
 let n=0n;for(const byte of bytes)n=n*256n+BigInt(byte);let result='';
 while(n){result=alphabet[Number(n%58n)]+result;n/=58n;}
 for(const byte of bytes){if(byte!==0)break;result='1'+result;}
 return result;
}
export async function intearSignInRequest(challenge,origin,now=Date.now(),cryptoApi=globalThis.crypto){
 if(challenge.recipient!==origin||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)||!/^[a-f0-9]{64}$/.test(challenge.state))throw Error('Invalid wallet challenge origin');
 const nonce=Uint8Array.from(atob(challenge.nonce),c=>c.charCodeAt(0));
 if(nonce.length!==32||typeof challenge.message!=='string')throw Error('Invalid wallet challenge');
 const pair=await cryptoApi.subtle.generateKey({name:'Ed25519'},false,['sign','verify']);
 const publicKey=new Uint8Array(await cryptoApi.subtle.exportKey('raw',pair.publicKey));
 const message=JSON.stringify({origin,messageToSign:JSON.stringify({message:challenge.message,nonce:[...nonce],recipient:origin,callbackUrl:null,state:challenge.state})});
 const digest=await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(now+'|'+message));
 const signature=new Uint8Array(await cryptoApi.subtle.sign('Ed25519',pair.privateKey,digest));
 return {type:'signIn',data:{version:'V3',networkId:'testnet',authPublicKey:'ed25519:'+base58(publicKey),nonce:now,signature:'ed25519:'+base58(signature),message,contractId:null,methodNames:[]}};
}
export function intearWalletProof(data,state){
 const proof=data?.signedMessage;
 if(data?.type!=='connected'||!proof)throw Error('Intear did not return a signed login message');
 if(proof.state!==state)throw Error('Intear login challenge state mismatch');
 if(proof.accountId!==data.accountId)throw Error('Intear login account mismatch');
 if(typeof proof.publicKey!=='string'||!proof.publicKey.startsWith('ed25519:'))throw Error('This wallet uses an unsupported signing key. Connect an Ed25519 Testnet account, such as arlosxq.testnet. Existing orders remain with their original account.');
 let signature=proof.signature;
 // Older deployed wallet builds return the NEAR base58 signature wrapper.
 // Normalize only its encoding; server-side NEP-413 verification remains mandatory.
 if(typeof signature==='string'&&signature.startsWith('ed25519:')){
  const encoded=signature.slice(8);
  if(!encoded||encoded.length>88||![...encoded].every(c=>alphabet.includes(c)))throw Error('Invalid Intear signature encoding');
  let n=0n;for(const c of encoded)n=n*58n+BigInt(alphabet.indexOf(c));
  const bytes=[];while(n){bytes.unshift(Number(n%256n));n/=256n;}
  for(const c of encoded){if(c!=='1')break;bytes.unshift(0);}
  if(bytes.length!==64)throw Error('Invalid Intear signature length');
  signature=btoa(String.fromCharCode(...bytes));
 }
 if(typeof signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(signature))throw Error('Invalid Intear signature encoding');
 if(data.functionCallKeyAdded!==false)throw Error('Unexpected wallet access-key permission');
 return {accountId:proof.accountId,publicKey:proof.publicKey,signature};
}
export async function connectIntear(popup,challenge,host=window){
 const request=await intearSignInRequest(challenge,host.location.origin);
 return new Promise((resolve,reject)=>{
  let done=false,sent=false;
  const finish=(error,value)=>{if(done)return;done=true;clearInterval(timer);host.removeEventListener('message',receive);error?reject(error):resolve(value);};
  const receive=event=>{
   if(event.source!==popup||event.origin!==INTEAR_ORIGIN)return;
   if(event.data?.type==='ready'&&!sent){sent=true;popup.postMessage(request,INTEAR_ORIGIN);}
   else if(event.data?.type==='connected'){try{finish(null,intearWalletProof(event.data,challenge.state));}catch(e){finish(e);}}
   else if(event.data?.type==='error')finish(Error('Intear signing was not completed.'));
  };
  const deadline=Date.now()+300000;
  const timer=setInterval(()=>{if(popup.closed||Date.now()>deadline)finish(Error('Wallet window closed or signing timed out.'));},300);
  host.addEventListener('message',receive);
  popup.location.href=INTEAR_ORIGIN+'/connect';
 });
}
