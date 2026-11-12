import {generateKeyPairSync,sign} from 'node:crypto';
import {walletDigest} from '../../apps/test-console/src/wallet-auth.ts';
export function walletProof(challenge,accountId='alice.testnet'){
 const keys=generateKeyPairSync('ed25519');
 const bytes=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32);
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
 let number=BigInt('0x'+bytes.toString('hex')),encoded='';
 while(number){encoded=alphabet[Number(number%58n)]+encoded;number/=58n;}
 for(const byte of bytes){if(byte!==0)break;encoded='1'+encoded;}
 const signature=sign(null,walletDigest({...challenge,nonce:Buffer.from(challenge.nonce,'base64')}),keys.privateKey);
 return {state:challenge.state,accountId,publicKey:'ed25519:'+encoded,signature:signature.toString('base64')};
}
