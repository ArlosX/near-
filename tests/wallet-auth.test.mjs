import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {WalletAuth,walletDigest} from '../apps/test-console/src/wallet-auth.ts';

function proof(challenge,accountId='alice.testnet'){
 const keys=generateKeyPairSync('ed25519');
 const bytes=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32);
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
 let number=BigInt('0x'+bytes.toString('hex')),encoded='';
 while(number){encoded=alphabet[Number(number%58n)]+encoded;number/=58n;}
 for(const byte of bytes){if(byte!==0)break;encoded='1'+encoded;}
 const signature=sign(null,walletDigest({...challenge,nonce:Buffer.from(challenge.nonce,'base64')}),keys.privateKey);
 return {state:challenge.state,accountId,publicKey:'ed25519:'+encoded,signature:signature.toString('base64')};
}
const origin='http://127.0.0.1:4318';
test('MyNearWallet popup digest encodes the optional callback as absent',()=>{
 const digest=walletDigest({message:'hi',nonce:Buffer.alloc(32),recipient:'app',callbackUrl:origin+'/',expires:0});
 assert.equal(digest.toString('hex'),'f0bc2e981141f4e70c4f7d426e0497bdc7ccf5399bf98735530048ad8a99779e');
});
test('wallet proof is browser-bound and consumed even during concurrent verification',async()=>{
 const auth=new WalletAuth(async id=>id==='alice.testnet');
 const challenge=auth.issue(origin),signed=proof(challenge);
 await assert.rejects(auth.login(origin,'different',signed),/this browser/);
 const first=auth.login(origin,challenge.state,signed);
 await assert.rejects(auth.login(origin,challenge.state,signed),/consumed/);
 const session=await first;
 assert.equal(auth.identity(session.token),'alice.testnet');
 auth.logout(session.token);
 assert.equal(auth.identity(session.token),null);
});
test('wallet rejects modified proof and unauthorized full-access key',async()=>{
 const auth=new WalletAuth(async()=>false);
 const first=auth.issue(origin),second=auth.issue(origin);
 await assert.rejects(auth.login(origin,second.state,{...proof(first),state:second.state}),/Invalid wallet signature/);
 await assert.rejects(auth.login(origin,first.state,proof(first)),/not a full-access/);
});

test('wallet sessions expire on idle time and remain bounded by absolute lifetime',async()=>{
 let now=1000;const auth=new WalletAuth(async()=>true,()=>now);
 const challenge=auth.issue(origin),session=await auth.login(origin,challenge.state,proof(challenge));
 now+=15*60*1000;
 assert.equal(await auth.authorize(session.token,origin),null);
 const fresh=auth.issue(origin),next=await auth.login(origin,fresh.state,proof(fresh));
 for(let i=0;i<5;i++){now+=10*60*1000;assert.equal(await auth.authorize(next.token,origin),'alice.testnet');}
 now+=10*60*1000;assert.equal(await auth.authorize(next.token,origin),null);
});

test('wallet rechecks revoked keys before writes and binds sessions to their origin',async()=>{
 let allowed=true,calls=0;const auth=new WalletAuth(async()=>{calls++;return allowed;});
 const challenge=auth.issue(origin),session=await auth.login(origin,challenge.state,proof(challenge));
 assert.equal(await auth.authorize(session.token,'http://localhost:4318',true),null);
 assert.equal(calls,1);
 allowed=false;assert.equal(await auth.authorize(session.token,origin,true),null);
 assert.equal(auth.identity(session.token),null);assert.equal(calls,2);
});

test('wallet fails closed on revalidation outage and logout wins an in-flight check',async()=>{
 let mode='ok',resolveCheck;const auth=new WalletAuth(async()=>{
  if(mode==='outage')throw new Error('offline');
  if(mode==='wait')return new Promise(resolve=>{resolveCheck=resolve;});
  return true;
 });
 const challenge=auth.issue(origin),session=await auth.login(origin,challenge.state,proof(challenge));
 mode='outage';await assert.rejects(auth.authorize(session.token,origin,true),/offline/);
 mode='wait';const pending=auth.authorize(session.token,origin,true);auth.logout(session.token);resolveCheck(true);
 assert.equal(await pending,null);assert.equal(auth.identity(session.token),null);
});

test('wallet challenge cannot finish login after expiration during RPC verification',async()=>{
 let now=1;const auth=new WalletAuth(async()=>{now+=300000;return true;},()=>now);
 const challenge=auth.issue(origin);
 await assert.rejects(auth.login(origin,challenge.state,proof(challenge)),/expired/);
});
