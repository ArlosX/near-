import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {hashBytes} from '../packages/agreements/src/agreement.ts';
import {runLocalJudge,encodeJudgeInput,checkLocalJudgeOutput} from '../packages/judge/src/local-judge.ts';
import {judgeSourceManifest} from './judge-source-manifest.mjs';
import {judgeConformanceVectors} from './judge-conformance-vectors.mjs';
const out=resolve('artifacts/local/judge-reference');await mkdir(out,{recursive:true});
const {manifest,codeHash}=await judgeSourceManifest();await writeFile(resolve(out,'source-manifest.json'),JSON.stringify({manifest,codeHash},null,2));
for(const vector of judgeConformanceVectors(codeHash)){
 const bytes=encodeJudgeInput(vector.input),expected={inputHash:hashBytes(bytes),codeHash};
 const output=runLocalJudge(bytes,expected);checkLocalJudgeOutput(bytes,expected,output);
 if(output.result.report.report.decision!==vector.decision)throw Error('Conformance failed: '+vector.name);
 await writeFile(resolve(out,vector.name+'.input.json'),bytes);
 await writeFile(resolve(out,vector.name+'.output.json'),JSON.stringify(output,null,2));
 console.log(JSON.stringify({name:vector.name,decision:vector.decision,...expected,outputHash:output.outputHash,attested:false}));
}
console.log('Local reference vectors written to '+out+'. No TEE, network, wallet or payment.');
