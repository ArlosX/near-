import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicKey,verify,createHash} from 'node:crypto';
import {base58,intearSignInRequest,intearWalletProof,connectIntear,INTEAR_ORIGIN} from '../apps/test-console/public/wallet-connector.js';
import {walletProof} from './fixtures/wallet.mjs';
const challenge={state:'a'.repeat(64),message:'Sign in to NEAR Agent Work on Testnet.',nonce:Buffer.alloc(32,7).toString('base64'),recipient:'http://127.0.0.1:4318',callbackUrl:'http://127.0.0.1:4318/'};
function decode(text){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const char of text)n=n*58n+BigInt(alphabet.indexOf(char));let hex=n.toString(16);let out=n===0n?Buffer.alloc(0):Buffer.from(hex.padStart(hex.length+(hex.length%2),'0'),'hex');return Buffer.concat([Buffer.alloc(text.match(/^1*/)?.[0].length??0),out]);}
test('Intear popup request signs the exact origin/network/challenge and requests no chain permissions',async()=>{
 const packet=await intearSignInRequest(challenge,challenge.recipient,1234),d=packet.data,m=JSON.parse(d.message),nep=JSON.parse(m.messageToSign);
 assert.equal(d.version,'V3');assert.equal(d.networkId,'testnet');assert.equal(d.contractId,null);assert.deepEqual(d.methodNames,[]);assert.equal(nep.callbackUrl,null);assert.equal(nep.state,challenge.state);assert.deepEqual(nep.nonce,[...Buffer.alloc(32,7)]);
 const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),decode(d.authPublicKey.slice(8))]),type:'spki',format:'der'});
 const digest=createHash('sha256').update(d.nonce+'|'+d.message).digest();assert.equal(verify(null,digest,key,decode(d.signature.slice(8))),true);
 await assert.rejects(()=>intearSignInRequest(challenge,'https://evil.invalid'),/origin/);
});
test('Intear response rejects mismatched state/account/permissions and retains server-verifiable NEP-413 proof',()=>{
 const p=walletProof(challenge),data={type:'connected',accountId:p.accountId,functionCallKeyAdded:false,signedMessage:p};
 assert.deepEqual(intearWalletProof(data,challenge.state),{accountId:p.accountId,publicKey:p.publicKey,signature:p.signature});
 const legacy={...data,signedMessage:{...p,signature:'ed25519:'+base58(Buffer.from(p.signature,'base64'))}};
 assert.deepEqual(intearWalletProof(legacy,challenge.state),intearWalletProof(data,challenge.state));
 assert.throws(()=>intearWalletProof({...data,signedMessage:{...p,signature:'ed25519:111'}},challenge.state),/length/);
 assert.throws(()=>intearWalletProof({...data,signedMessage:{...p,publicKey:'ml-dsa-65-hash:unsupported'}},challenge.state),/unsupported signing key/);
 for(const x of [{...data,accountId:'other.testnet'},{...data,functionCallKeyAdded:true},{...data,signedMessage:{...p,state:'b'.repeat(64)}}])assert.throws(()=>intearWalletProof(x,challenge.state));
});

test('wallet popup messages are bound to both exact origin and the opened window',async()=>{
 let receive,registered;const ready=new Promise(resolve=>{registered=resolve;});const sent=[];
 const popup={closed:false,location:{href:''},postMessage:(value,origin)=>sent.push({value,origin})};
 const host={location:{origin:challenge.recipient},addEventListener:(name,fn)=>{receive=fn;registered();},removeEventListener:()=>{receive=null;}};
 const result=connectIntear(popup,challenge,host);await ready;
 receive({source:{},origin:INTEAR_ORIGIN,data:{type:'ready'}});receive({source:popup,origin:'https://evil.invalid',data:{type:'ready'}});assert.equal(sent.length,0);
 receive({source:popup,origin:INTEAR_ORIGIN,data:{type:'ready'}});assert.equal(sent.length,1);assert.equal(sent[0].origin,INTEAR_ORIGIN);
 const proof=walletProof(challenge);receive({source:popup,origin:INTEAR_ORIGIN,data:{type:'connected',accountId:proof.accountId,signedMessage:proof,functionCallKeyAdded:false}});
 assert.equal((await result).accountId,proof.accountId);assert.equal(receive,null);
});
