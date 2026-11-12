import {WalletAuth} from './wallet-auth.ts';
import {createEvidenceStorage} from '../../../packages/database/src/evidence-storage.ts';
import {createDatabasePool} from '../../../packages/database/src/connection.ts';
import {PostgresExecutionStore} from '../../../packages/database/src/postgres-execution-store.ts';
import {PostgresWorkflow} from '../../../packages/orchestration/src/postgres-workflow.ts';
import {PostgresWorker} from '../../../packages/orchestration/src/postgres-worker.ts';
import {createConsoleServer} from './server.ts';
import {invariant} from '../../../packages/shared/src/domain.ts';
import {testnetEscrowConfig} from '../../../packages/shared/src/testnet-config.ts';
export async function startPostgresConsole(){
 const {contractId,verifier,verificationMode}=testnetEscrowConfig(process.env);
 const pool=createDatabasePool();
 let storage;
 try{await pool.query('SELECT config_bytes,state_json FROM near_agent_work.workflow_runs LIMIT 0');await pool.query('SELECT storage_key,content_hash FROM near_agent_work.evidence_objects LIMIT 0');storage=createEvidenceStorage();await storage.ensureBucket();}
 catch{await pool.end();throw new Error('Database migrations 0004/0005 or private Storage unavailable; no automatic migration performed');}
 const store=new PostgresExecutionStore(pool,'near_agent_work',storage,'demo-client.testnet',contractId,verifier,verificationMode),service=new PostgresWorkflow(store),worker=new PostgresWorker(store);
 const server=createConsoleServer(store,service,new WalletAuth()),port=Number(process.env.PORT??4318);
 invariant(Number.isInteger(port)&&port>=0&&port<=65535,'invalid port');
 server.listen(port,'127.0.0.1',()=>console.log('PostgreSQL fixture console: http://127.0.0.1:'+port+' — synthetic source data; owner-signed Testnet transactions; inference is explicit'));
 let running=false;
 const timer=setInterval(()=>{if(running)return;running=true;void worker.tick().catch(()=>console.error('PostgreSQL fixture worker failed; bounded recovery after lease expiry')).finally(()=>{running=false;});},1000);timer.unref();
 const stop=()=>{clearInterval(timer);server.close(()=>{void pool.end();});};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 return {server,pool,stop};
}
