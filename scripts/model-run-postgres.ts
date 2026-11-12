import {createDatabasePool} from '../packages/database/src/connection.ts';
import {createEvidenceStorage} from '../packages/database/src/evidence-storage.ts';
import {PostgresExecutionStore} from '../packages/database/src/postgres-execution-store.ts';
import {NearAiAdapter,settingsFromEnv} from '../packages/model/src/near-ai.ts';
import {runPostgresModel} from '../packages/orchestration/src/postgres-model-run.ts';
import {account,identifier,invariant} from '../packages/shared/src/domain.ts';
import {testnetEscrowConfig} from '../packages/shared/src/testnet-config.ts';

async function main(){
 const [mode,actor,orderId,...extra]=process.argv.slice(2);
 const settings=settingsFromEnv(process.env);
 invariant(settings.provider==='gemini'||settings.provider==='nvidia','Use a Gemini Free Tier or NVIDIA Free Endpoint key for this workflow');
 const adapter=new NearAiAdapter(settings);
 if(mode==='--check'&&!actor&&!orderId){console.log({configured:true,model:adapter.settings.model,networkCalls:0});return;}
 invariant(mode==='--run'&&extra.length===0,'Use --check or --run <account> <order>');
 account(actor,'account');
 identifier(orderId,'order');
 const {contractId,verifier,verificationMode}=testnetEscrowConfig(process.env);
 const storage=createEvidenceStorage();
 const pool=createDatabasePool();
 try{
  const store=new PostgresExecutionStore(pool,'near_agent_work',storage,actor,contractId,verifier,verificationMode);
  const result=await runPostgresModel(store,adapter,orderId);
  console.log(JSON.stringify({orderId,status:result.status,reports:result.reports.map(({report,reportHash})=>({task:report.taskId,decision:report.decision,reportHash}))},null,2));
  invariant(['CHECKS_PASSED_LOCAL','AWAITING_TEE'].includes(result.status),'Model output did not pass workflow checks');
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Model run failed');process.exitCode=1;});
