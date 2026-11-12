import { canonicalJson, hash, hashBytes } from '../../packages/agreements/src/agreement.ts';
export function fixture(mode = 'extraction', budgetMinor = '2500') {
 const sources = [{id:'source-a',text:'A: unit price 1000, shipping 100, delivery 3 days.'},{id:'source-b',text:'B: unit price 1300, shipping 0, delivery unknown.'}];
 const constraints = {currency:'USD',quantity:2,budgetMinor,maxDeliveryDays:7};
 const criteria = names => names.map(checker=>({id:checker,checker,version:1}));
 const extraction = {schemaVersion:'2',taskId:'extract',mode:'extraction',constraints,criteria:criteria(['source_quote','total_cost'])};
 const comparison = {schemaVersion:'2',taskId:'compare',mode:'comparison',constraints,criteria:criteria(['source_quote','total_cost','selection','dependency_hash','budget','delivery'])};
 const task=(id,policy,dependsOn,amount)=>({id,agentId:id+'-worker',runtimeVersion:'v1',recipientAccountId:id+'.testnet',amountAtomic:amount,required:true,dependsOn,maxRevisions:1,criteria:policy.criteria,verificationPolicyHash:hash(policy)});
 const agreement={schemaVersion:'1.2',network:'testnet',contractId:'escrow.testnet',orderId:'order-1',clientAccountId:'client.testnet',verifierAccountId:'verifier.testnet',asset:'NEAR',totalAmountAtomic:'100',resultCutoffNs:'1000',sourceManifestHash:hash(sources),settlement:'full_parent_success',failure:'full_client_refund',tasks:[task('extract',extraction,[],'40'),task('compare',comparison,['extract'],'60')]};
 const suppliers=[{id:'a',sourceId:'source-a',quote:'unit price 1000',unitPriceMinor:'1000',quantity:2,shippingMinor:'100',currency:'USD',deliveryDays:3,totalMinor:'2100'},{id:'b',sourceId:'source-b',quote:'unit price 1300',unitPriceMinor:'1300',quantity:2,shippingMinor:'0',currency:'USD',deliveryDays:null,totalMinor:'2600'}];
 const upstream={schemaVersion:'1',taskId:'extract',version:1,inputArtifactHashes:{},suppliers,selectedSupplierId:null};
 const upstreamBytes=canonicalJson(upstream),agreementHash=hash(agreement);
 const artifact=mode==='extraction'?upstream:{...upstream,taskId:'compare',inputArtifactHashes:{extract:hashBytes(upstreamBytes)},selectedSupplierId:'a'};
 return {agreement,approvedAgreementHash:agreementHash,taskId:mode==='extraction'?'extract':'compare',policy:mode==='extraction'?extraction:comparison,sources,artifactBytes:canonicalJson(artifact),revision:0,evaluatedAtNs:'10',acceptedDependencies:mode==='extraction'?[]:[{orderId:'order-1',taskId:'extract',agreementHash,artifactHash:hashBytes(upstreamBytes),artifactBytes:upstreamBytes}]};
}
export function editArtifact(request, edit) { const artifact=JSON.parse(request.artifactBytes);edit(artifact);request.artifactBytes=canonicalJson(artifact);return request; }
