import {canonicalJson,hashBytes} from './agreement.ts';
import {TEE_CODE} from './tee-settlement.ts';
import {invariant,record} from '../../shared/src/domain.ts';
import {parseJsonStrict} from '../../shared/src/json.ts';

export const TEE_LIMITS={max_instructions:1000000000,max_memory_mb:128,max_execution_seconds:30};
const WASM_URL='https://raw.githubusercontent.com/ArlosX/near-/a25b1940d6560ac86daae4c8eceb874133ba7844/judge.wasm';
export function teeExecutionArgs(inputData:string){
 invariant(Buffer.byteLength(inputData)<=65536,'TEE input exceeds contract limit');
 const wrapped=record(parseJsonStrict(inputData),'TEE input');
 invariant(canonicalJson(wrapped)===inputData&&typeof wrapped.inputBytes==='string'&&wrapped.expectedInputHash===hashBytes(wrapped.inputBytes)&&wrapped.expectedCodeHash==='sha256:'+TEE_CODE,'TEE execution input commitment mismatch');
 return {source:{WasmUrl:{url:WASM_URL,hash:TEE_CODE,build_target:'wasm32-wasip2'}},resource_limits:{...TEE_LIMITS},input_data:inputData,response_format:'Text'};
}
export function teeExecutionIntent(inputData:string,signerId:string,estimate:unknown){
 invariant(typeof estimate==='string'&&/^[1-9]\d*$/.test(estimate),'Invalid OutLayer cost estimate');
 invariant(BigInt(estimate)<=10000000000000000000000n,'OutLayer estimate exceeds 0.01 Testnet NEAR budget');
 return {network:'testnet',receiverId:'outlayer.testnet',signerId,methodName:'request_execution',depositAtomic:estimate,gasTgas:100,args:teeExecutionArgs(inputData)};
}
