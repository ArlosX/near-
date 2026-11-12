import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

// Offline preparation only. Never loads credentials, signs or sends a transaction.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const wasmPath=resolve(root,'contracts/work-escrow/target/wasm32-unknown-unknown/release/work_escrow.wasm');
const wasm=await readFile(wasmPath);
if(!wasm.subarray(0,4).equals(Buffer.from([0,97,115,109])))throw Error('Expected a compiled WebAssembly module');
const sha256=createHash('sha256').update(wasm).digest('hex');
const sourceFiles=['contracts/work-escrow/src/lib.rs','contracts/work-escrow/src/contract.rs','contracts/work-escrow/src/state.rs','contracts/work-escrow/src/tee.rs','contracts/work-escrow/src/near_crypto.rs','contracts/work-escrow/src/intel-root.der','contracts/work-escrow/Cargo.toml','contracts/work-escrow/Cargo.lock'];
const sources={};
for(const file of sourceFiles)sources[file]=createHash('sha256').update(await readFile(resolve(root,file))).digest('hex');
const baseStorageBytes=Number((await readFile(resolve(root,'contracts/work-escrow/src/contract.rs'),'utf8')).match(/const BASE_STORAGE: u64 = (\d+);/)[1]);
const perOrderStorageBytes=16384;
const account=process.argv[2];
if(account&&!/^(?=.{2,64}$)[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet$/.test(account))throw Error('Provide a named .testnet account');
const out=resolve(root,'artifacts/local/deployment-review');await mkdir(out,{recursive:true});
await writeFile(resolve(out,'manifest.json'),JSON.stringify({preparedAt:new Date().toISOString(),network:'testnet',account:account??null,wasmPath,wasmBytes:wasm.length,sha256,sources,profiles:['designated-verifier','outlayer-tdx-direct-v1'],requiresRuntime:['p256_verify'],baseStorageBytes,perOrderStorageBytes,buildProvenance:'Local artifact and source hashes only; run contract build and Sandbox gates before signing.',status:'PREPARATION_ONLY_NOT_DEPLOYED'},null,2)+'\n');
const target=account??'<FRESH_CONTRACT_ACCOUNT.testnet>';
await writeFile(resolve(out,'OWNER-STEPS.md'),`# Contract deployment review\n\nNo transaction has been signed or sent.\n\nWasm SHA-256: ${sha256}\n\n1. Use a fresh Testnet contract account and an unexposed signing key. Never reinitialize the historical escrow with its existing orders.\n2. Review the source, manifest and passing test logs. Hashes alone do not prove the binary was built from these sources.\n3. Fund operator storage headroom separately from customer escrow. The base envelope is ${baseStorageBytes} bytes (${(baseStorageBytes/100000).toFixed(5)} NEAR at the tested storage price), plus 16KiB per order and gas headroom. Verify current costs before signing.\n4. With the official NEAR CLI, review deployment to ${target} and initialize new only on the fresh account.\n5. As the contract account, call set_client_admission with the approved client and allowed=true.\n6. Recheck contract code hash, initialization, admission and storage reserve before accepting a funded order.\n7. After verifying deployment, set NEAR_CONTRACT_ID and NEAR_VERIFIER_ACCOUNT_ID in the local environment, restart the PostgreSQL console and create fresh orders. Do not silently switch legacy funding commands: TEE orders must use create_tee_work_order and get_tee_state. Follow docs/tee-escrow-stage4.md and docs/operator-runbook.md to verify settlement and refund before switching the demo.\n\nThe old scripts/deploy-testnet.ps1 is historical and must not be used as an upgrade path.\n`);
console.log(JSON.stringify({directory:out,sha256,bytes:wasm.length,status:'PREPARATION_ONLY_NOT_DEPLOYED'}));


