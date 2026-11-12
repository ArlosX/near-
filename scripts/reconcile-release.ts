import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createDatabasePool} from '../packages/database/src/connection.ts';
import {createEvidenceStorage} from '../packages/database/src/evidence-storage.ts';
import {PostgresExecutionStore} from '../packages/database/src/postgres-execution-store.ts';
import {operatorRun} from '../packages/shared/src/operator-run.ts';
import {readJsonResponse} from '../packages/shared/src/json.ts';
import {invariant,record} from '../packages/shared/src/domain.ts';
import {verifyWithdrawalOutcome} from '../packages/agreements/src/withdrawal-confirmation.ts';
import {hash} from '../packages/agreements/src/agreement.ts';
import {setTimeout as delay} from 'node:timers/promises';
async function main(){
 const folder=operatorRun().folder,cp=JSON.parse(await readFile(resolve(folder,'checkpoint.json'),'utf8'));
 const prep=JSON.parse(await readFile(resolve(folder,'withdrawal-preparation.json'),'utf8')),saved=JSON.parse(await readFile(resolve(folder,'withdrawal-confirmed.json'),'utf8'));
 invariant(cp.orderId===prep.orderId&&cp.agreementHash===prep.agreementHash,'Withdrawal preparation checkpoint mismatch');
 const response=await fetch('https://rpc.testnet.fastnear.com',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),redirect:'error',body:JSON.stringify({jsonrpc:'2.0',id:'withdrawal-reconcile',method:'tx',params:{tx_hash:saved.txHash,sender_account_id:'arlosx.testnet',wait_until:'FINAL'}})});
 invariant(response.ok,'Withdrawal RPC unavailable');const rpc=record(await readJsonResponse(response,524288),'withdrawal RPC');invariant(!rpc.error&&rpc.id==='withdrawal-reconcile','Withdrawal transaction unavailable');
 const proof=verifyWithdrawalOutcome('agentwork-tee-arlosx.testnet','arlosx.testnet',prep.amountAtomic,saved.txHash,rpc.result);
 const pool=createDatabasePool(),archive=createEvidenceStorage(),cache=new Map<string,string>();
 const storage={put:(scope:string,bytes:string)=>archive.put(scope,bytes),get:async(key:string,digest:string)=>{const k=key+digest;if(!cache.has(k))for(let i=0;i<3;i++){try{cache.set(k,await archive.get(key,digest));break;}catch(e){if(!(e instanceof Error)||e.message!=='Private evidence unavailable'||i===2)throw e;await delay(500*(i+1));}}return cache.get(k)!;}};
 try{
  const store=new PostgresExecutionStore(pool,'near_agent_work',storage,'arlosx.testnet','agentwork-tee-arlosx.testnet','arlosx.testnet','outlayer-tdx-direct-v1');
  const detail=await store.details(cp.orderId);invariant(hash(detail.config.agreement)===cp.agreementHash,'Database agreement mismatch');
  const plan=await store.checkSettlement(cp.orderId);invariant(plan.state==='credited','Finalized allocation required');
  await store.execute('confirm-withdrawal',cp.orderId,'withdraw-'+saved.txHash,{txHash:saved.txHash},async()=>{await store.event(cp.orderId,'withdraw-'+saved.txHash,'settlement.withdrawal.confirmed',proof);return proof;});
  const old=JSON.parse(await readFile('artifacts/local/stage6-success/checkpoint.json','utf8'));
  const refund=await store.checkRefund(old.orderId);invariant(refund.state==='refunded','Historical new-profile refund not reconciled');
  await writeFile(resolve(folder,'release-reconciliation.json'),JSON.stringify({withdrawal:proof,refund,verifiedAt:new Date().toISOString()},null,2)+'\n');
  console.log(JSON.stringify({withdrawal:'FINAL_PAID',refund:'REFUNDED',databaseReconciled:true}));
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Reconciliation failed');process.exitCode=1;});
