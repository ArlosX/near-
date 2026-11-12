import {createDemoConfig,artifactTemplate} from '../packages/orchestration/src/demo-data.ts';
import {canonicalJson,hash,hashBytes} from '../packages/agreements/src/agreement.ts';

export function judgeConformanceVectors(codeHash){
 const config=createDemoConfig('judge-conformance',1000000000n,'2500');
 const extract=artifactTemplate('extract',1,config.suppliers,{},null),extractBytes=canonicalJson(extract);
 const dependency={orderId:config.agreement.orderId,taskId:'extract',agreementHash:hash(config.agreement),artifactHash:hashBytes(extractBytes),artifactBytes:extractBytes};
 const compare=artifactTemplate('compare',1,config.suppliers,{extract:dependency.artifactHash},'a');
 function input(requestId,artifact,dependencies=[],revision=0){return {schemaVersion:'1',requestId,codeHash,verification:{agreement:config.agreement,approvedAgreementHash:hash(config.agreement),taskId:artifact.taskId,policy:config.policies[artifact.taskId],sources:config.sources,artifactBytes:canonicalJson(artifact),revision,evaluatedAtNs:'2000000000',acceptedDependencies:dependencies}};}
 const bad=structuredClone(extract);bad.suppliers[0].totalMinor='999';
 const fabricated=structuredClone(extract);fabricated.suppliers[0].unitPriceMinor='1';fabricated.suppliers[0].totalMinor='102';
 const altered=structuredClone(compare);altered.suppliers[0].shippingMinor='0';altered.suppliers[0].totalMinor='2000';
 const noEligible=structuredClone(compare);noEligible.selectedSupplierId=null;
 const repaired=structuredClone(extract);repaired.version=2;
 return [
  {name:'extraction-pass',input:input('extract-pass',extract),decision:'accepted'},
  {name:'wrong-total',input:input('wrong-total',bad),decision:'revision_required'},
  {name:'fabricated-price',input:input('fabricated-price',fabricated),decision:'revision_required'},
  {name:'repaired',input:input('repaired',repaired,[],1),decision:'accepted'},
  {name:'comparison-pass',input:input('compare-pass',compare,[dependency]),decision:'accepted'},
  {name:'changed-predecessor-facts',input:input('altered',altered,[dependency]),decision:'revision_required'},
  {name:'false-no-eligible',input:input('false-none',noEligible,[dependency]),decision:'revision_required'},
 ];
}
