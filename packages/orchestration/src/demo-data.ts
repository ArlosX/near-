import { hash, validateAgreement } from '../../agreements/src/agreement.ts';
import type { Agreement, Criterion, Task } from '../../shared/src/domain.ts';
import type { Policy, Artifact } from '../../verification/src/policy.ts';
import type { Source, Supplier } from '../../verification/src/verify.ts';
export type DemoConfig = { verificationMode?: 'outlayer-tdx-direct-v1'|'outlayer-tdx-direct-v2'|'outlayer-tdx-direct-v3'; agreement: Agreement; policies: Record<string,Policy>; sources: Source[]; suppliers: Supplier[] };
export function createDemoConfig(orderId: string, nowNs: bigint, budgetMinor: string, lifetimeSeconds = 3600, clientAccountId = 'demo-client.testnet', contractId = 'undeployed-escrow.testnet', settlementAccount?:string): DemoConfig {
 const sources = [{id:'source-a',text:'SYNTHETIC A: unit price 1000, shipping 100, delivery 3 days.'},{id:'source-b',text:'SYNTHETIC B: unit price 1300, shipping 0, delivery unknown.'}];
 const constraints = {currency:'USD',quantity:2,budgetMinor,maxDeliveryDays:7};
 const criteria = (names: Criterion['checker'][]): Criterion[] => names.map(checker=>({id:checker,checker,version:1}));
 const extraction: Policy = {schemaVersion:'2',taskId:'extract',mode:'extraction',constraints,criteria:criteria(['source_quote','total_cost'])};
 const comparison: Policy = {schemaVersion:'2',taskId:'compare',mode:'comparison',constraints,criteria:criteria(['source_quote','total_cost','selection','dependency_hash','budget','delivery'])};
 const task = (id: string, policy: Policy, dependsOn: string[], amount: string): Task => ({id,agentId:id+'-worker',runtimeVersion:'v1',recipientAccountId:settlementAccount??id+'.testnet',amountAtomic:amount,required:true,dependsOn,maxRevisions:1,criteria:policy.criteria,verificationPolicyHash:hash(policy)});
 const deployed=contractId!=='undeployed-escrow.testnet';
 const agreement = validateAgreement({schemaVersion:'1.2',network:'testnet',contractId,orderId,clientAccountId,verifierAccountId:settlementAccount??'demo-verifier.testnet',asset:'NEAR',totalAmountAtomic:deployed?'1000000000000000000000':'100',resultCutoffNs:(nowNs+BigInt(lifetimeSeconds)*1000000000n).toString(),sourceManifestHash:hash(sources),settlement:'full_parent_success',failure:'full_client_refund',tasks:[task('extract',extraction,[],deployed?'400000000000000000000':'40'),task('compare',comparison,['extract'],deployed?'600000000000000000000':'60')]},nowNs);
 const suppliers: Supplier[] = [{id:'a',sourceId:'source-a',quote:'unit price 1000',unitPriceMinor:'1000',quantity:2,shippingMinor:'100',currency:'USD',deliveryDays:3,totalMinor:'2100'},{id:'b',sourceId:'source-b',quote:'unit price 1300',unitPriceMinor:'1300',quantity:2,shippingMinor:'0',currency:'USD',deliveryDays:null,totalMinor:'2600'}];
 return {agreement,policies:{extract:extraction,compare:comparison},sources,suppliers};
}
export function artifactTemplate(taskId: string, version: number, suppliers: Supplier[], dependencyHashes: Record<string,string>, selectedSupplierId: string|null): Artifact {
 return {schemaVersion:'1',taskId,version,inputArtifactHashes:dependencyHashes,suppliers,selectedSupplierId};
}
