import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hashBytes} from '../packages/agreements/src/agreement.ts';
import {identifier,invariant} from '../packages/shared/src/domain.ts';
import {parseJsonStrict} from '../packages/shared/src/json.ts';

const CODE='bb9fa85b135deb155f187f9ea49df8c907f90b885a88b90459f5bed208122051';
const COLLATERAL='2e80992e78a9e76e5726db22b7399c553439574e6fe512a3b311ae4c3d559140';
const sha=bytes=>hashBytes(bytes).slice(7);
/** Transport preparation, NOT cryptographic verification. Never trusts the bundle's
 * stored verdict, signs, sends, or creates an accepted:true settlement instruction. */
export function prepareTeeProof(bundle,orderId,taskId){
 identifier(orderId,'order');identifier(taskId,'task');
 invariant(bundle.bundle_format===1&&bundle.network==='testnet','Testnet proof bundle required');
 const a=bundle.attestation;
 invariant(a?.task_type==='execute'&&a.build_target==='wasm32-wasip2'&&a.wasm_hash===CODE,'unsupported judge execution');
 invariant(a.repo_url==null&&a.commit_hash==null&&a.project_id==null&&a.secrets_ref==null&&a.attached_usd==='0','unsupported attestation preimage');
 invariant(typeof bundle.input_raw==='string'&&sha(bundle.input_raw)===a.input_hash,'exact input bytes required');
 invariant(typeof bundle.output_raw==='string'&&Buffer.byteLength(bundle.output_raw)<=16384&&sha(bundle.output_raw)===a.output_hash,'exact Text return bytes required');
 invariant(typeof bundle.collateral==='string'&&sha(bundle.collateral)===COLLATERAL,'unapproved collateral');
 invariant(Number.isSafeInteger(a.task_id)&&a.task_id>0&&Number.isSafeInteger(a.block_height)&&a.block_height>0&&Number.isSafeInteger(a.timestamp)&&a.timestamp>0,'invalid attestation identifiers');
 invariant(typeof a.tdx_quote==='string'&&Buffer.from(a.tdx_quote,'base64').toString('base64')===a.tdx_quote,'canonical quote base64 required');
 const stdout=parseJsonStrict(bundle.output_raw);invariant(typeof stdout==='string','JSON encoded Text return required');
 const guest=parseJsonStrict(stdout);
 invariant(guest.result?.verification?.orderId===orderId&&guest.result?.verification?.taskId===taskId,'wrong output order or task');
 return {order_id:orderId,task_id:taskId,proof:{task_id:a.task_id,block_height:String(a.block_height),timestamp:String(a.timestamp),caller_account_id:a.caller_account_id,wasm_hash:a.wasm_hash,input_hash:a.input_hash,output_hash:a.output_hash,quote:a.tdx_quote},collateral:bundle.collateral,output_data:bundle.output_raw};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [file,orderId,taskId,out]=process.argv.slice(2);
 invariant(file&&orderId&&taskId&&out,'Usage: node scripts/prepare-tee-proof.mjs BUNDLE.json ORDER_ID TASK_ID OUTPUT-ARGS.json');
 const bytes=await readFile(file,'utf8');invariant(Buffer.byteLength(bytes)<=1024*1024,'proof bundle too large');
 const args=prepareTeeProof(parseJsonStrict(bytes.replace(/^\uFEFF/,'')),orderId,taskId);
 await writeFile(out,JSON.stringify(args,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({file:resolve(out),method:'submit_tee_result',gas:'300 Tgas',deposit:'0 NEAR',status:'PREPARED_ONLY_CONTRACT_MUST_VERIFY'}));
}
