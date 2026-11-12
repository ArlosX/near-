import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const bytes=readFileSync(process.argv[2]);
if(!bytes.subarray(0,4).equals(Buffer.from([0,97,115,109])))throw Error('Expected WebAssembly artifact');
const digest=createHash('sha256').update(bytes).digest();
let n=BigInt('0x'+digest.toString('hex')),out='';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
while(n){out=alphabet[Number(n%58n)]+out;n/=58n;}
let zeros=0;while(zeros<digest.length&&digest[zeros]===0)zeros++;
process.stdout.write('1'.repeat(zeros)+out);
