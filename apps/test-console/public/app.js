const $=id=>document.getElementById(id);
let current=localStorage.getItem('near-work-console-order'),detail=null,orders=[],busy=false,selectedReport='',lastSubmission=null;
let walletAccount=null,walletRequired=false,ready=false;
const chainChecks=new Map();
const labels={ACTIVE_LOCAL:'In progress · Local',CHECKS_PASSED_LOCAL:'Checks passed · Local',FAILED_LOCAL:'Failed · Local',EXPIRED_LOCAL:'Expired · Local',BLOCKED_LOCAL:'Blocked · Local',PENDING:'Pending',IN_PROGRESS:'In progress',REVISION_REQUIRED:'Revision required',REJECTED:'Rejected',accepted:'Accepted · Local checks',revision_required:'Revision required',rejected:'Rejected'};
const text=value=>typeof value==='string'?value:JSON.stringify(value,null,2);
function el(tag,content,cls){const node=document.createElement(tag);if(content!==undefined)node.textContent=content;if(cls)node.className=cls;return node;}
function feedback(message,error=false){$('feedback').textContent=message;$('feedback').className=error?'error':'';}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
async function api(url,body){const response=await fetch(url,{...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Local-Console':'1'},body:JSON.stringify(body)}),signal:AbortSignal.timeout(45000)});const data=await response.json();if(response.status===401)lockWorkspace();if(!response.ok)throw new Error(response.status===401?'Your session has expired. Reconnect your wallet.':data.error||'Service error');return data;}
function setBusy(value){busy=value;$('loading-state').hidden=!value;$('main').setAttribute('aria-busy',String(value));document.querySelectorAll('button,input,select,textarea').forEach(n=>n.disabled=value);if(!value){controls();if($('workspace-order'))$('workspace-order').disabled=!ready||!orders.length;}}
async function action(work){if(busy)return;setBusy(true);try{await work();}catch(error){const message=error.message==='Invalid wallet signature'?'Wallet signature could not be verified.':error instanceof TypeError?'Connection unavailable. Check that the local server is running, then refresh.':error.name==='TimeoutError'?'The service timed out. Refresh the status; the operation was not automatically retried.':error.message;feedback(message,true);if($('create-dialog').open)$('create-error').textContent=message;}finally{setBusy(false);}}
let draftAccount='local-fixture';
function draftKey(part){return JSON.stringify(['near-work-draft',draftAccount,current,part]);}
function readDraft(part){try{return sessionStorage.getItem(draftKey(part));}catch{return null;}}
function writeDraft(part,value){try{sessionStorage.setItem(draftKey(part),value);return true;}catch{return false;}}
function saveEditor(){
 if(!current)return;
 const task=$('task').value;
 const saved=writeDraft(task,$('artifact').value)&&writeDraft('selected-task',task);
 $('draft-status').textContent=saved?'Draft saved in this tab.':'The browser could not save your draft.';
}
function restoreEditor(){
 const selected=readDraft('selected-task');
 $('task').value=selected==='extract'||selected==='compare'?selected:detail?.state.tasks.extract.status==='CHECKS_PASSED_LOCAL'?'compare':'extract';
 const saved=current?readDraft($('task').value):null;
 $('artifact').value=saved??'';
 $('draft-status').textContent=saved===null?'':'Draft restored.';
}
$('artifact').addEventListener('input',saveEditor);
function baseControls(){const task=detail?.state.tasks[$('task').value];const active=detail?.state.status==='ACTIVE_LOCAL';const deps=$('task').value==='extract'||detail?.state.tasks.extract.status==='CHECKS_PASSED_LOCAL';$('start').disabled=!detail||!active||!deps||!['PENDING','REVISION_REQUIRED'].includes(task?.status);$('template').disabled=!detail||!deps;$('submit').disabled=!detail||!active||task?.status!=='IN_PROGRESS';$('rollback').disabled=!detail;$('expire').disabled=!detail||!active;$('replay').disabled=!lastSubmission||lastSubmission.orderId!==current;}
// Bound visual updates: only a few visible surfaces, no layout animation.
const surfaceAnimations=new WeakMap();
let pendingSurfaceFrame=0;
function softWorkspaceUpdate(){
 cancelAnimationFrame(pendingSurfaceFrame);
 pendingSurfaceFrame=requestAnimationFrame(()=>{
  if($('dashboard').hidden)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const screen=document.querySelector('[data-screen]:not([hidden])');if(!screen)return;
  const candidates=[...screen.querySelectorAll('.panel,.metrics')].filter(node=>{const r=node.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;});
  const surfaces=candidates.filter(node=>!candidates.some(parent=>parent!==node&&parent.contains(node))).slice(0,6);
  surfaces.forEach((node,index)=>{
   surfaceAnimations.get(node)?.cancel();
   const frames=reduced?[{opacity:.65},{opacity:1}]:[{opacity:0,translate:'0 9px'},{opacity:1,translate:'0 0'}];
   const animation=node.animate(frames,{duration:reduced?120:300,delay:reduced?0:index*35,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'});
   surfaceAnimations.set(node,animation);animation.onfinish=()=>surfaceAnimations.delete(node);
  });
 });
}
async function refresh(){orders=await api('/api/orders');if(!orders.some(o=>o.id===current))current=orders[0]?.id??null;if(current){localStorage.setItem('near-work-console-order',current);detail=await api('/api/orders/'+current);}else detail=null;restoreEditor();render();softWorkspaceUpdate();}
function render(){
 const allocated=detail?.financialStatus==='SUCCESS_CREDITED';
 const paid=allocated&&detail.events.some(e=>e.type==='settlement.withdrawal.confirmed');
 const deployed=detail?.escrowAvailable===true;
 if($('tee-status')){const checked=chainChecks.get(current);$('tee-status').hidden=!detail?.config.verificationMode;$('tee-status').textContent=detail?.config.verificationMode?'Verification mode: direct Intel TDX proof. '+(detail.events.some(e=>e.type==='model.replay.imported')?'Worker output: recorded-model replay, not new live inference. ':'')+'Local checks do not unlock dependent work. '+(checked?'Last final chain check: '+checked.chainStatus+' at '+checked.checkedAt:'Use Check settlement step to read final contract state.'):'';}
 $('settlement-panel').hidden=!deployed||detail?.config.agreement.verifierAccountId==='demo-verifier.testnet'||!['FUNDED','SUCCESS_CREDITED'].includes(detail?.financialStatus);
 $('settlement-feedback').textContent=detail?.events.some(e=>e.type==='settlement.withdrawal.confirmed')?'Actual withdrawal confirmed on Testnet.':detail?.financialStatus==='SUCCESS_CREDITED'?'Agent shares have been allocated on Testnet; withdrawal is separate.':'';
 $('settlement-command').textContent='';
 const eligibleFunding=deployed&&['APPROVED','FUNDED'].includes(detail?.financialStatus);
 $('refund-panel').hidden=!deployed||!['FUNDED','EXPIRED','FAILED','REFUNDED'].includes(detail?.financialStatus);
 $('refund-feedback').textContent=detail?.financialStatus==='REFUNDED'?'Refund confirmed on Testnet.':'';
 $('refund-command').textContent='';
 $('funding-panel').hidden=!eligibleFunding;
 $('funding-summary').textContent=detail?.financialStatus==='FUNDED'?'Funding confirmed on Testnet.':deployed?'Fund '+formatNear(detail.config.agreement.totalAmountAtomic)+' test NEAR to '+detail.config.agreement.contractId+'. Review and sign the prepared command in PowerShell.':'';
 $('prepare-funding').hidden=detail?.financialStatus==='FUNDED';
 $('confirm-funding').hidden=detail?.financialStatus==='FUNDED';
 $('funding-command').textContent='';

 renderOverview();renderOrderLists();renderWorkspaceConnections();renderGuidedAction();
 $('download-evidence').hidden=!detail;
 if(detail)$('download-evidence').href='/api/orders/'+current+'/evidence-package';
 $('outcome-guidance').textContent=!detail?'':paid?'Both tasks were accepted on Testnet, fixed shares were allocated and the full withdrawal was confirmed.':allocated?'Both tasks were accepted on Testnet and fixed shares were allocated. Recipient withdrawal is separate.':detail.state.status==='CHECKS_PASSED_LOCAL'?'All local checks passed. On-chain verdicts and allocation are separate; recipients claim their credits afterward.':['FAILED_LOCAL','EXPIRED_LOCAL'].includes(detail.state.status)?'The full workflow did not succeed. No partial worker payment is earned. For a funded order, check contract refund eligibility and claim separately.':'All required tasks must pass before success allocation. A final failure blocks the dependent flow.';

 if(!detail){$('tasks').replaceChildren(el('div','Create an order to get started.','empty-state'));$('order-summary').textContent='No order selected';$('order-status').textContent='No order';$('financial-status').textContent='—';$('escrow-amount').textContent='—';$('config').textContent='';$('evidence-order').textContent='No order selected';for(const id of ['count-reports','count-commits','count-rollbacks'])$(id).textContent='0';$('report-select').replaceChildren(new Option('No reports yet',''));$('transactions').replaceChildren();$('events').replaceChildren();renderReport();controls();return;}
 $('financial-status').textContent=detail.events.some(e=>e.type==='settlement.withdrawal.confirmed')?'Withdrawal confirmed · Paid on Testnet':financialLabel(detail.financialStatus);$('escrow-amount').textContent=detail.financialStatus?formatNear(detail.config.agreement.totalAmountAtomic)+' NEAR':detail.config.agreement.totalAmountAtomic+' yoctoNEAR · Sample amount';$('evidence-order').textContent=detail.orderId;
 $('order-summary').textContent=detail.orderId+' · version '+detail.version;$('order-status').textContent=labels[detail.state.status];
 $('count-reports').textContent=detail.reports.length;$('count-commits').textContent=detail.transactions.filter(t=>t.outcome==='COMMITTED').length;$('count-rollbacks').textContent=detail.transactions.filter(t=>t.outcome==='ROLLED_BACK').length;
 $('tasks').replaceChildren();for(const id of detail.config.agreement.tasks.map(t=>t.id)){const task=detail.state.tasks[id];const card=el('div',undefined,'task-card');const chain=chainChecks.get(current)?.chainTasks?.find(t=>t.id===id)?.result;const taskLabel=detail.config.verificationMode?(chain?.accepted===true||(allocated&&task.status==='CHECKS_PASSED_LOCAL')?'Accepted on-chain · TEE':id==='compare'&&!chainChecks.get(current)?.chainTasks?.find(t=>t.id==='extract')?.result?.accepted?'Locked · awaiting on-chain extraction':(labels[task.status]||task.status)+' · TEE acceptance separate'):(labels[task.status]||task.status);card.append(el('strong',id==='extract'?'1. Extract & cite':'2. Compare & select'),el('span',taskLabel,'badge'),el('p','Revisions used: '+task.revisions+' / '+task.maxRevisions+' · Output version: '+(task.artifactVersion??'—')));$('tasks').append(card);}
 renderGuidedAction();
 $('config').textContent=JSON.stringify(detail.config,null,2);
 $('report-select').replaceChildren();if(!detail.reports.length)$('report-select').append(new Option('No reports yet',''));
 for(const e of detail.reports)$('report-select').append(new Option(e.report.taskId+' · v'+e.report.artifactVersion+' · '+labels[e.report.decision],e.reportHash));
 if(!detail.reports.some(e=>e.reportHash===selectedReport))selectedReport=detail.reports.at(-1)?.reportHash??'';$('report-select').value=selectedReport;renderReport();
 $('transactions').replaceChildren();for(const tx of [...detail.transactions].reverse()){const row=el('tr');const info=el('td');info.append(el('pre',tx.tx_id),el('small',new Date(tx.created_at).toLocaleString('en-US',{timeZone:'UTC',timeZoneName:'short'})));row.append(el('td',tx.operation),el('td',tx.outcome,tx.outcome==='ROLLED_BACK'?'fail':'pass'),info,el('td',tx.detail));$('transactions').append(row);}
 $('events').replaceChildren();for(const event of detail.events){const li=el('li');li.append(el('code',event.seq+' · '+event.type),el('pre',JSON.stringify(event.payload,null,2)));$('events').append(li);}if(busy)document.querySelectorAll('button,input,select').forEach(n=>n.disabled=true);else controls();
}
function renderReport(){const envelope=detail?.reports.find(e=>e.reportHash===selectedReport);$('checks').replaceChildren();$('download').hidden=!envelope;if(!envelope){$('report-summary').textContent='No reports have been recorded yet.';$('report-json').textContent='';return;}
 $('download').href='/api/orders/'+current+'/reports/'+envelope.reportHash;$('report-summary').textContent=labels[envelope.report.decision]+' · deterministic_only · This report does not authorize payment.';$('report-json').textContent=JSON.stringify(envelope,null,2);
 for(const check of envelope.report.checks){const row=el('tr');const id=el('td');id.append(el('code',check.criterionId),el('small',check.checker+' v'+check.checkerVersion));const values=el('td');values.append(el('small','Expected'),el('pre',text(check.expected)),el('small','Actual'),el('pre',text(check.actual)));row.append(id,el('td',check.passed?'✓ Pass':'× Fail',check.passed?'pass':'fail'),values,el('td',check.reason));$('checks').append(row);}
}
async function create(budget=$('budget').value){const response=await api('/api/orders',{requestId:crypto.randomUUID(),budgetMinor:budget,lifetimeSeconds:Number($('lifetime').value)});current=response.value.orderId;selectedReport='';lastSubmission=null;$('task').value='extract';await refresh();await loadTemplate();}
async function loadTemplate(){if(!current)return;const template=await api('/api/orders/'+current+'/template?taskId='+$('task').value);$('artifact').value=JSON.stringify(template,null,2);saveEditor();return template;}
async function startTask(taskId=$('task').value){await api('/api/orders/'+current+'/start',{taskId,expectedVersion:detail.version,requestId:crypto.randomUUID()});await refresh();writeDraft('selected-task',taskId);restoreEditor();}
async function submitArtifact(artifact,taskId=$('task').value){const body={taskId,artifactBytes:canonical(artifact),expectedVersion:detail.version,requestId:crypto.randomUUID()};lastSubmission={orderId:current,body};const response=await api('/api/orders/'+current+'/submit',body);selectedReport='';await refresh();return response;}
let createStep=0;
function renderCreateStep(){
 const titles=['Set your purchase budget','Choose the execution deadline','Review before creating'];
 document.querySelectorAll('[data-create-step]').forEach(node=>node.hidden=Number(node.dataset.createStep)!==createStep);
 $('create-title').textContent=titles[createStep];
 $('create-progress').textContent='Step '+(createStep+1)+' of 3 · '+['Budget','Deadline','Review'][createStep];
 $('create-back').hidden=createStep===0;
 $('create-next').textContent=createStep===2?'Create agreement →':'Continue →';
 $('create-review').textContent='Purchase budget: '+$('budget').value+' USD cents. Execution deadline: '+$('lifetime').value+' seconds after creation.';
 $('create-error').textContent='';
 (createStep===0?$('budget'):createStep===1?$('lifetime'):$('create-next')).focus();
}
$('create-back').onclick=()=>{createStep=Math.max(0,createStep-1);renderCreateStep();};
$('create-form').onsubmit=event=>{
 event.preventDefault();
 const budget=$('budget'),lifetime=$('lifetime');
 if(createStep===0&&!budget.reportValidity())return;
 if(createStep>=1&&!lifetime.reportValidity())return;
 if(createStep<2){createStep++;renderCreateStep();return;}
 if(!budget.reportValidity()){createStep=0;renderCreateStep();budget.reportValidity();return;}
 action(async()=>{await create();$('create-dialog').close();showPage('workspace');feedback('Sample order and frozen agreement saved to the database.');});
};
$('refresh').onclick=()=>action(async()=>{await refresh();feedback('Data refreshed from the database.');});
$('task').onchange=()=>action(async()=>{const saved=readDraft($('task').value);$('artifact').value=saved??'';saveEditor();controls();if(saved===null&&!$('template').disabled)await loadTemplate();feedback('Task editor ready.');});
$('start').onclick=()=>action(async()=>{await startTask();if(readDraft($('task').value)===null)await loadTemplate();feedback('Task started. The output editor is ready.');});
$('template').onclick=()=>action(async()=>{await loadTemplate();feedback('Sample output loaded. This is not AI-generated output.');});
$('submit').onclick=()=>action(async()=>{const response=await submitArtifact(JSON.parse($('artifact').value));feedback('Committed atomically: '+labels[response.value.decision]);});
$('replay').onclick=()=>action(async()=>{const response=await api('/api/orders/'+lastSubmission.orderId+'/submit',lastSubmission.body);await refresh();feedback(response.replayed?'Idempotency verified: no duplicate artifacts, reports or events were created.':'Request recorded.');});
$('rollback').onclick=()=>action(async()=>{const response=await api('/api/orders/'+current+'/rollback-probe',{expectedVersion:detail.version});await refresh();feedback('Rollback verified: '+JSON.stringify(response.before)+' → '+JSON.stringify(response.after));});
$('expire').onclick=()=>action(async()=>{await api('/api/orders/'+current+'/expire',{expectedVersion:detail.version,requestId:crypto.randomUUID()});await refresh();feedback('Local expiry recorded. No on-chain refund has occurred.');});
$('download-evidence').onclick=event=>{event.preventDefault();action(async()=>{
 const id=current;if(!id)throw new Error('Select an order first.');
 const bundle=await api('/api/orders/'+id+'/evidence-package');
 const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}));
 const link=el('a');link.href=url;link.download=id+'-evidence.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 feedback('Evidence package downloaded. Hash bindings are checked; authenticity, TEE execution and payment are not proven by this file.');
});};
$('report-select').onchange=()=>{selectedReport=$('report-select').value;renderReport();};
for(const button of document.querySelectorAll('[data-scenario]'))button.onclick=()=>action(async()=>{
 const scenario=button.dataset.scenario;feedback('Running scenario through the API and database…');await create(scenario==='none'?'500':$('budget').value);showPage('workspace');
 async function execute(taskId,bad){$('task').value=taskId;await startTask(taskId);const artifact=await loadTemplate();if(bad)artifact.suppliers[0].totalMinor='999';$('artifact').value=JSON.stringify(artifact,null,2);saveEditor();return submitArtifact(artifact,taskId);}
 await execute('extract',scenario==='repair'||scenario==='failure');
 if(scenario==='repair'||scenario==='failure')await execute('extract',scenario==='failure');
 if(scenario!=='failure')await execute('compare',false);
 await refresh();feedback('Scenario complete: '+labels[detail.state.status]+'. Inspect the reports and actual database transactions.');
});
function testnetCommand(intent){
 const cli='D:/Arlos/Desktop/NEAR/near-agent-work/artifacts/local/near-cli/near-cli-rs-x86_64-pc-windows-msvc/near.exe';
 // Use a file so Windows PowerShell passes the exact JSON unchanged.
 const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
 const json=quote(JSON.stringify(intent.args));
 const gas=Number(intent.gasTgas??80);if(![80,100,220,250,300].includes(gas))throw new Error('Unsupported transaction gas budget');
 return [
  '$fundingArgs = Join-Path $env:TEMP "near-work-funding-'+current+'.json"',
  '[IO.File]::WriteAllText($fundingArgs, '+json+')',
  '& '+quote(cli)+' contract call-function as-transaction '+intent.receiverId+' '+intent.methodName+' file-args $fundingArgs prepaid-gas "'+gas+' Tgas" attached-deposit "'+intent.depositAtomic+' yoctoNEAR" sign-as '+intent.signerId+' network-config testnet'
 ].join('\n');
}
$('prepare-funding').onclick=()=>action(async()=>{
 $('funding-command').textContent=testnetCommand(await api('/api/orders/'+current+'/funding'));
});
$('check-refund').onclick=()=>action(async()=>{
 const status=$('refund-feedback');
 status.className='';
 status.textContent='Checking final contract state…';
 $('refund-command').textContent='';
 try{
  const result=await api('/api/orders/'+current+'/check-refund',{});
  const messages={expire:'The deadline has passed. Run the expiry command, then check the status again.',claim:'The order is eligible for a refund. Sign the claim command with the owner wallet.',pending:'Transfer in progress. Check again shortly.',refunded:'Refund confirmed on Testnet.',unavailable:'This order is not currently eligible for a refund.'};
  if(result.state==='refunded')await refresh();
  status.textContent=messages[result.state]||'Check the operator runbook for this state.';
  if(result.intent)$('refund-command').textContent=testnetCommand(result.intent);
 }catch(error){
  status.className='fail';
  status.textContent=error.message;
 }
});
$('confirm-funding').onsubmit=event=>{event.preventDefault();action(async()=>{
 const status=$('funding-feedback');
 const txHash=$('funding-hash').value.trim();
 status.className='';
 if(!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash)){
  status.className='fail';
  status.textContent='Enter the complete funding transaction hash from PowerShell.';
  return;
 }
 status.textContent='Checking the Testnet transaction…';
 try{
  await api('/api/orders/'+current+'/confirm-funding',{txHash});
 }catch(error){
  status.className='fail';
  status.textContent='Funding verification failed. '+error.message;
  return;
 }
 status.textContent='Funding confirmed. Refreshing the order…';
 try{await refresh();$('funding-hash').value='';status.textContent='';}
 catch{status.textContent='Funding recorded. Refresh the order to see its updated status.';}

});};
$('check-settlement').onclick=()=>action(async()=>{
 const status=$('settlement-feedback');
 status.className='';
 status.textContent='Reading final contract state…';
 $('settlement-command').textContent='';
 try{
  const result=await api('/api/orders/'+current+'/check-settlement',{});
  if(result.state==='credited')await refresh();
  if(result.verificationMode){chainChecks.set(current,{...result,checkedAt:new Date().toISOString()});render();}
  const messages={record:'Sign the designated-verifier result command. This is the legacy mode.',prepare:'Local output is ready. Sign prepare_tee_request to freeze the exact TEE input.',execute:'The TEE input is committed. Execute the pinned judge through the operator TEE command; then submit its proof.',model:'The next task is eligible on-chain. Run its model through the operator workflow; no model runs automatically.',expire:'The cutoff passed with incomplete work. Use Check refund to prepare expiry.',refund:'No partial worker entitlement. Use Check refund to claim the full principal.',refunded:'The full principal refund is confirmed on-chain.',finalize:'Every required result is accepted on-chain. Sign to allocate the fixed shares.',credited:'Shares allocated on Testnet. Actual withdrawal is a separate transaction.'};
  status.textContent=messages[result.state];
  if(result.intent)$('settlement-command').textContent=testnetCommand(result.intent);
 }catch(error){
  status.className='fail';
  status.textContent=error.message;
 }
});
async function walletLogin() {
 const popup=window.open('about:blank','near-agent-work-wallet','popup,width=480,height=640');
 if(!popup)throw new Error('Allow pop-ups to open your wallet.');
 try {
  const challenge=await api('/api/auth/challenge',{});
  const {connectIntear}=await import('/wallet-connector.js?v=intear-proof-2');
  const proof=await connectIntear(popup,challenge);
  await api('/api/auth/login',{...proof,state:challenge.state});
  location.reload();
 } finally {popup.close();}
}
const pageNames={overview:'Overview',orders:'Orders',workspace:'Workflow',evidence:'Evidence'};
function showPage(name,updateHash=true){
 if(name==='main')return;
 if(!Object.hasOwn(pageNames,name))name='overview';
 for(const screen of document.querySelectorAll('[data-screen]'))screen.hidden=screen.dataset.screen!==name;
 for(const link of document.querySelectorAll('[data-nav]')){if(link.dataset.nav===name)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 $('page-title').textContent=pageNames[name];document.title='Prooflane';
 window.scrollTo({top:0,behavior:'instant'});softWorkspaceUpdate();
 if(updateHash&&location.hash!=='#'+name)location.hash=name;
}
window.addEventListener('hashchange',()=>showPage(location.hash.slice(1),false));
function openCreate(){if(!ready){feedback('Connect to your workspace first.',true);return;}createStep=0;$('create-dialog').showModal();renderCreateStep();}
for(const button of document.querySelectorAll('[data-create]'))button.onclick=openCreate;
$('close-create').onclick=()=>$('create-dialog').close();
$('create-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
for(const button of document.querySelectorAll('[data-copy]'))button.onclick=()=>action(async()=>{const value=$(button.dataset.copy).textContent;if(!value)throw new Error('No command is ready yet.');await navigator.clipboard.writeText(value);feedback('Command copied. Review the amount and account before signing.');});
$('order-search').addEventListener('input',renderOrderLists);$('order-filter').addEventListener('change',renderOrderLists);
function financialLabel(status){return ({APPROVED:'Awaiting funding',FUNDED:'Funding confirmed',SUCCESS_CREDITED:'Shares allocated; claim separately',REFUNDED:'Refund confirmed',EXPIRED:'Expired',FAILED:'Failed'})[status]??'Local execution only; not funded';}
function formatNear(value){const amount=BigInt(value),unit=10n**24n;const fraction=(amount%unit).toString().padStart(24,'0').replace(/0+$/,'');return (amount/unit).toString()+(fraction?'.'+fraction:'');}
function selectOrder(id){return action(async()=>{saveEditor();current=id;selectedReport='';lastSubmission=null;await refresh();showPage('workspace');feedback('Order and evidence loaded from the database.');});}
function orderRow(order){const button=el('button',undefined,'order-row'+(order.id===current?' selected':''));const info=el('span');info.append(el('code',order.id.slice(-12)),el('small',Object.values(order.state.tasks).filter(t=>t.status==='CHECKS_PASSED_LOCAL').length+' / '+Object.keys(order.state.tasks).length+' tasks verified'));button.append(info,el('span',labels[order.state.status]||order.state.status,'order-status'),el('span','→','row-arrow'));button.setAttribute('aria-label','Open order '+order.id.slice(-12));button.onclick=()=>selectOrder(order.id);return button;}
function renderOrderLists(){
 const query=$('order-search').value.trim().toLowerCase(),filter=$('order-filter').value;
 const visible=orders.filter(order=>order.id.toLowerCase().includes(query)&&(filter==='all'||filter==='attention'&&(['FAILED_LOCAL','EXPIRED_LOCAL'].includes(order.state.status)||Object.values(order.state.tasks).some(t=>t.status==='REVISION_REQUIRED'))||order.state.status===filter));
 $('orders').replaceChildren(...visible.map(orderRow));if(!visible.length)$('orders').append(el('div',orders.length?'No orders match these filters.':'No orders yet. Select New order to get started.','empty-state'));
 $('recent-orders').replaceChildren(...orders.slice(0,4).map(orderRow));if(!orders.length)$('recent-orders').append(el('div','Your first order starts here. Create one to track its progress and evidence.','empty-state'));
}
function renderOverview(){
 $('count-orders').textContent=orders.length;$('count-active').textContent=orders.filter(o=>o.state.status==='ACTIVE_LOCAL').length;$('count-passed').textContent=orders.filter(o=>o.state.status==='CHECKS_PASSED_LOCAL').length;$('count-attention').textContent=orders.filter(o=>['FAILED_LOCAL','EXPIRED_LOCAL'].includes(o.state.status)||Object.values(o.state.tasks).some(t=>t.status==='REVISION_REQUIRED')).length;
 let title='Create your first order',copy='Define the agreement and verification policy. Funding is a separate step.',label='Create order',target=openCreate,step='01';
 if(detail){title='Continue your workflow';copy='Submit each task output and inspect its verification result.';label='Open workflow';target=()=>showPage('workspace');step='02';
 if(detail.financialStatus==='APPROVED'){title='Review & fund the agreement';copy='Testnet funding requires your signature. Sample execution is separate from payment.';}
 if(detail.state.status==='CHECKS_PASSED_LOCAL'){title='Evidence ready for review';copy='Passing local checks does not mean payment. Review the reports, then check on-chain status.';label='Review evidence';target=()=>showPage('evidence');step='03';}
 if(['FAILED_LOCAL','EXPIRED_LOCAL'].includes(detail.state.status)){title='This outcome needs attention';copy='Review the failure or expiry report. For funded orders, check refund eligibility separately.';step='!';}
 if(detail.financialStatus==='SUCCESS_CREDITED'){const paid=detail.events.some(e=>e.type==='settlement.withdrawal.confirmed');title=paid?'Withdrawal confirmed':'Shares allocated';copy=paid?'The full demo credit was transferred and its successful callback verified.':'On-chain allocation is confirmed. Each recipient claims their funds separately.';step='04';}
 }
 $('next-title').textContent=title;$('next-copy').textContent=copy;$('next-number').textContent=step;$('next-action').textContent=label+' →';$('next-action').onclick=target;
}
function renderGuidedAction(){
 let title='Create your fixed agreement',copy='Set a budget, choose a deadline, then review the two dependent tasks.',label='Create order',run=openCreate;
 if(detail){
  const state=detail.state,financial=detail.financialStatus;
  const taskId=state.tasks.extract.status==='CHECKS_PASSED_LOCAL'?'compare':'extract';
  const task=state.tasks[taskId];
  const focusPanel=id=>{showPage('workspace');$(id).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});};
  if(financial==='REFUNDED'){
   title='Full refund confirmed';copy='The contract confirms the principal was refunded. Inspect the recorded evidence.';label='Review evidence';run=()=>showPage('evidence');
  }else if(financial==='SUCCESS_CREDITED'){
   const paid=detail.events.some(e=>e.type==='settlement.withdrawal.confirmed');title=paid?'Withdrawal confirmed · paid on Testnet':'Shares allocated · recipient claim follows';copy=paid?'The full credit was transferred and its successful callback verified.':'Allocation is confirmed. A successful withdrawal receipt is required to confirm payment.';label='Review evidence';run=()=>showPage('evidence');
  }else if(['FAILED_LOCAL','EXPIRED_LOCAL'].includes(state.status)){
   title=state.status==='FAILED_LOCAL'?'Final failure · dependent work stopped':'Deadline reached · work stopped';
   copy='No partial worker payment is earned. '+(detail.escrowAvailable&&['FUNDED','FAILED','EXPIRED'].includes(financial)?'Check contract refund eligibility, then sign the claim.':'Inspect the result. Sample orders have no funded principal to refund.');
   label=detail.escrowAvailable&&['FUNDED','FAILED','EXPIRED'].includes(financial)?'Check refund':'Review evidence';run=label==='Check refund'?()=>$('check-refund').click():()=>showPage('evidence');
  }else if(detail.escrowAvailable&&financial==='APPROVED'){
   title='Review and fund the agreement';copy='Confirm the fixed recipients and fees before signing. Funding is separate from wallet login.';label='Review funding';run=()=>focusPanel('funding-panel');
  }else if(state.status==='CHECKS_PASSED_LOCAL'){
   title='Both tasks passed local checks';copy='Review both reports. A funded order still needs on-chain verdicts and allocation before recipients can claim.';label='Review evidence';run=()=>showPage('evidence');
   if(detail.escrowAvailable&&financial==='FUNDED'){label='Check settlement';run=()=>$('check-settlement').click();}
  }else{
   title=(taskId==='extract'?'1 · Extract supplier terms':'2 · Compare accepted extraction')+(task.status==='REVISION_REQUIRED'?' · correction needed':'');
   copy=taskId==='extract'?'Task 2 stays locked until extraction passes. Use the sample output or edit it under Advanced.':'Task 1 passed. Comparison must preserve its accepted facts and use the exact accepted output hash.';
   if(task.status==='IN_PROGRESS'){
    label='Verify sample output';run=()=>action(async()=>{writeDraft('selected-task',taskId);restoreEditor();const artifact=await loadTemplate();await submitArtifact(artifact,taskId);feedback('Sample output checked. Review the report in Evidence.');});
   }else{
    label=task.status==='REVISION_REQUIRED'?'Start correction':'Start '+(taskId==='extract'?'extraction':'comparison');
    run=()=>action(async()=>{await startTask(taskId);await loadTemplate();feedback('Task started. Verify the sample output or use the Advanced editor.');});
   }
  }
 }
 if(detail?.config.verificationMode){
  const state=chainChecks.get(current)?.state;
  title=detail.events.some(e=>e.type==='settlement.withdrawal.confirmed')?'Actual withdrawal confirmed':detail.financialStatus==='REFUNDED'?'Full principal refunded':state==='refunded'?'Full principal refunded':state==='credited'?'Shares allocated · withdrawal separate':'TEE workflow · verify chain state';
  const allocated=detail.financialStatus==='SUCCESS_CREDITED',paid=allocated&&detail.events.some(e=>e.type==='settlement.withdrawal.confirmed');
  copy=paid?'Workflow complete. Both dependent tasks were accepted on-chain and the full withdrawal succeeded. Review the reports and transaction receipts.':allocated?'Both tasks were accepted on-chain and fixed shares were allocated. Recipient withdrawal is separate.':'Local checks are separate from contract acceptance. Read the final chain state, then follow the owner-reviewed operator step. No transaction or model call runs automatically.';
  label=allocated?'Review evidence':'Read TEE state';run=allocated?()=>showPage('evidence'):()=>$('check-settlement').click();
  if(['expire','refund'].includes(state)){title='Incomplete workflow · full refund';label='Check refund';run=()=>$('check-refund').click();}
 }
 $('guided-title').textContent=title;$('guided-copy').textContent=copy;$('guided-action').textContent=label+' →';$('guided-action').onclick=run;
 $('next-title').textContent=title;$('next-copy').textContent=copy;$('next-action').textContent=label+' →';$('next-action').onclick=()=>{showPage('workspace');run();};
 const cards=[...$('tasks').children];
 cards.forEach((card,index)=>{
  if(!detail)return;
  const taskId=detail.config.agreement.tasks[index]?.id;
  if(!taskId)return;
  const task=detail.state.tasks[taskId];
  const locked=taskId==='compare'&&(detail.config.verificationMode?detail.financialStatus!=='SUCCESS_CREDITED'&&!chainChecks.get(current)?.chainTasks?.find(t=>t.id==='extract')?.result?.accepted:detail.state.tasks.extract.status!=='CHECKS_PASSED_LOCAL');
  card.classList.toggle('dependency-locked',locked);
  const note=el('p',locked?'Locked · waiting for accepted extraction':detail.financialStatus==='SUCCESS_CREDITED'?(taskId==='compare'?'Completed · used the accepted extraction':'Completed · extraction accepted on-chain'):taskId==='compare'?'Unlocked · uses the accepted extraction':'First step · acceptance unlocks comparison','dependency-note');
  card.querySelector('.dependency-note')?.remove();card.append(note);
 });
}
function renderWallet(){
 $('wallet-action').replaceChildren();if(!walletRequired)return;
 if(walletAccount){const account=el('span',walletAccount,'badge');account.title='Connected Testnet account';$('wallet-action').append(account);}
 const button=el('button',walletAccount?'Disconnect wallet':'Connect Testnet wallet');button.type='button';button.id=walletAccount?'disconnect-wallet':'connect-wallet';
 button.onclick=()=>action(async()=>{
  if(!walletAccount){await walletLogin();return;}
  await api('/api/auth/logout',{});
  chainChecks.clear();localStorage.removeItem('near-work-console-order');
  lockWorkspace();feedback('Wallet disconnected from this workspace.');
 });$('wallet-action').append(button);
}
function lockWorkspace(){ready=false;walletAccount=null;detail=null;orders=[];lastSubmission=null;selectedReport='';current=null;draftAccount='signed-out';$('artifact').value='';$('dashboard').hidden=true;$('welcome').hidden=false;$('create-dialog').close();render();renderWallet();}
$('welcome-connect').onclick=()=>action(walletLogin);
const welcomeCube=document.querySelector('.hero-art svg').cloneNode(true);
for(const node of welcomeCube.querySelectorAll('[id]'))node.id='welcome-'+node.id;
for(const node of welcomeCube.querySelectorAll('[fill]')){const fill=node.getAttribute('fill');if(fill.startsWith('url(#'))node.setAttribute('fill',fill.replace('url(#','url(#welcome-'));}
$('welcome-art').append(welcomeCube);
showPage(location.hash.slice(1),false);

// Shared order context across all four screens.
const contextBar=el('div',undefined,'workspace-context');
const contextLabel=el('label','Current order');contextLabel.htmlFor='workspace-order';
const contextSelect=el('select');contextSelect.id='workspace-order';contextSelect.setAttribute('aria-label','Current order');
contextSelect.onchange=async()=>{const screen=location.hash.slice(1);await selectOrder(contextSelect.value);showPage(screen);};
const refreshAll=el('button','Refresh workspace','secondary');refreshAll.id='refresh-workspace';refreshAll.type='button';
refreshAll.onclick=()=>action(async()=>{saveEditor();await refresh();feedback('All screens refreshed from the database.');});
contextBar.append(contextLabel,contextSelect,refreshAll);$('dashboard').prepend(contextBar);
for(const [index,id]of ['count-orders','count-active','count-passed','count-attention'].entries()){
 const tile=$(id).parentElement;tile.tabIndex=0;tile.setAttribute('role','button');
 tile.setAttribute('aria-label',['View all orders','View active orders','View orders with passed checks','View orders needing attention'][index]);
 const open=()=>{if(!ready||busy)return;$('order-search').value='';$('order-filter').value=['all','ACTIVE_LOCAL','CHECKS_PASSED_LOCAL','attention'][index];renderOrderLists();showPage('orders');};
 tile.onclick=open;tile.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
}
$('order-filter').append(new Option('Needs attention','attention'));
function renderWorkspaceConnections(){
 if(!$('workspace-order'))return;
 contextSelect.replaceChildren(...orders.map(o=>new Option(o.id.slice(-12)+' · '+(labels[o.state.status]||o.state.status),o.id)));
 if(!orders.length)contextSelect.append(new Option('No orders yet',''));
 contextSelect.value=current??'';contextSelect.disabled=!orders.length;
}
function controls(){
 baseControls();
 const task=detail?.state.tasks[$('task').value],active=detail?.state.status==='ACTIVE_LOCAL';
 const hint=!detail?'Create or select an order to begin.':!active?'This order is terminal. Review its evidence or create a new order.':$('task').value==='compare'&&detail.state.tasks.extract.status!=='CHECKS_PASSED_LOCAL'?'Complete and verify extraction before starting comparison.':task?.status==='PENDING'?'Start this task, load a sample or enter output, then submit for verification.':task?.status==='REVISION_REQUIRED'?'Review the failed checks, start a revision, then submit corrected output.':task?.status==='IN_PROGRESS'?'Task is running. Submit JSON output to generate a verification report.':'This task passed local checks. Continue to the next task or inspect its evidence.';
 if(detail?.config.verificationMode){for(const id of ['start','submit','template','replay'])$(id).disabled=true;}
 let taskHint=$('task-guidance');if(!taskHint){taskHint=el('p');taskHint.id='task-guidance';taskHint.setAttribute('role','status');$('artifact').before(taskHint);}taskHint.textContent=hint;
 for(const id of ['start','submit','replay','expire'])$(id).title=$(id).disabled?(id==='replay'?'Submit an output first to replay the exact same request.':id==='expire'?'Select an active order; expiry is permitted only after its deadline.':hint):'';
 $('artifact').disabled=!detail;$('task').disabled=!detail;$('report-select').disabled=!detail?.reports.length;
 if($('refresh-workspace'))$('refresh-workspace').disabled=!ready;
 for(const select of document.querySelectorAll('select'))select.dispatchEvent(new Event('ui:sync'));
 for(const [index,card]of [...$('tasks').children].entries()){
  if(!detail)break;const taskId=detail.config.agreement.tasks[index]?.id;if(!taskId)continue;
  if(!card.querySelector('button')){const pick=el('button','Open task →','secondary');pick.type='button';pick.onclick=()=>action(async()=>{saveEditor();$('task').value=taskId;const draft=readDraft(taskId);$('artifact').value=draft??'';saveEditor();const report=detail.reports.filter(e=>e.report.taskId===taskId).at(-1);if(report){selectedReport=report.reportHash;$('report-select').value=selectedReport;renderReport();showPage('evidence');$('evidence').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}else{$('manual-tools').open=true;$('manual-tools').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}feedback('Opened '+taskId+'.');});card.append(pick);}
 }
}
action(async()=>{
 const params=new URLSearchParams(location.hash.slice(1));
 if(window.opener&&(params.has('signature')||params.has('error'))){
  history.replaceState(null,'',location.pathname);
  window.opener.postMessage({type:'near-wallet-callback',status:params.has('error')?'failure':'success',signedRequest:Object.fromEntries(params)},location.origin);
  return;
 }
 const health=await api('/api/health');
 $('database-mode').textContent=health.walletAuth?'Testnet · PostgreSQL':'Local demo · SQLite';walletRequired=Boolean(health.walletAuth);
 if(health.walletAuth){
  const session=await api('/api/auth/session');
  walletAccount=session.accountId;renderWallet();
  if(session.accountId)draftAccount=session.accountId;
  if(!session.accountId){feedback('Connect your Testnet wallet to access your orders.');return;}
 }
 await refresh();
 ready=true;$('welcome').hidden=true;
 $('dashboard').hidden=false;softWorkspaceUpdate();
 feedback('Workspace ready.');
});

// Decorative ribbon background; independent of workflow, wallet and API state.
(()=>{
 const ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 1600 1000');
 svg.setAttribute('preserveAspectRatio','xMidYMid slice');
 svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 svg.classList.add('live-ribbons');
 svg.innerHTML=`<defs>
 <linearGradient id="ribbon-body" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--ribbon-body-high, #39bee9)" stop-opacity=".20"/><stop offset=".45" stop-color="var(--ribbon-body-mid, #14769c)" stop-opacity=".09"/><stop offset="1" stop-color="var(--ribbon-body-low, #063148)" stop-opacity="0"/></linearGradient>
 <linearGradient id="ribbon-edge"><stop stop-color="var(--ribbon-edge-low, #8bd8f8)" stop-opacity=".05"/><stop offset=".18" stop-color="var(--ribbon-edge-high, #b9edff)" stop-opacity=".75"/><stop offset=".48" stop-color="var(--ribbon-edge-mid, #347fa5)" stop-opacity=".20"/><stop offset=".82" stop-color="var(--ribbon-edge-high, #b9edff)" stop-opacity=".7"/><stop offset="1" stop-color="var(--ribbon-edge-low, #8bd8f8)" stop-opacity=".08"/></linearGradient>
 <filter id="ribbon-glow" x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="10"/></filter>
 </defs>`;
 function curve(y,amplitude,phase){
  const points=Array.from({length:7},(_,i)=>({x:-240+i*350,y:y+Math.sin(i*1.3+phase)*amplitude}));
  let d=`M ${points[0].x} ${points[0].y}`;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];d+=` C ${a.x+150} ${a.y}, ${b.x-150} ${b.y}, ${b.x} ${b.y}`;}return d;
 }
 const movingPaths=[];
 function animatedPath(values,duration,attributes){
  const path=document.createElementNS(ns,'path');path.setAttribute('d',values[0]);
  for(const [key,value]of Object.entries(attributes))path.setAttribute(key,value);
  const animation=document.createElementNS(ns,'animate');
  for(const [key,value]of Object.entries({attributeName:'d',dur:duration+'s',repeatCount:'indefinite',values:values.join(';'),calcMode:'spline',keyTimes:'0;0.25;0.5;0.75;1',keySplines:'0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1'}))animation.setAttribute(key,value);
  movingPaths.push({path,values,duration,numbers:values.map(value=>value.match(/-?\d+(?:\.\d+)?/g).map(Number))});svg.append(path);
 }
 for(const [y,amplitude,phase,duration,opacity]of [[300,120,0,32,.8],[380,95,1.8,48,.3],[790,100,2.3,40,.65],[710,135,3.5,48,.2]]){
  const curves=Array.from({length:5},(_,i)=>curve(y,amplitude,phase+(i%4)*Math.PI/2));
  const bodies=curves.map(d=>d+' L 1860 '+(y+230)+' C 1000 '+(y+210)+', 500 '+(y+180)+', -240 '+(y+150)+' Z');
  animatedPath(bodies,duration,{fill:'url(#ribbon-body)',opacity:String(opacity)});
  animatedPath(curves,duration,{fill:'none',stroke:'var(--ribbon-glow-color, #46c7f2)','stroke-width':'12',filter:'url(#ribbon-glow)',opacity:String(opacity*.24)});
  animatedPath(curves,duration,{fill:'none',stroke:'url(#ribbon-edge)','stroke-width':'1.2',opacity:String(opacity)});
 }
 document.body.prepend(svg);
 let motionPaused=false;
 const motionButton=document.createElement('button');motionButton.className='background-motion secondary';motionButton.type='button';motionButton.textContent='Pause background';motionButton.setAttribute('aria-pressed','false');document.body.append(motionButton);
 motionButton.onclick=()=>{motionPaused=!motionPaused;motionButton.textContent=motionPaused?'Play background':'Pause background';motionButton.setAttribute('aria-pressed',String(motionPaused));sync();};
 let frame=0,elapsed=0,last=0;
 function tick(now){
  if(last)elapsed+=(now-last)/1000;last=now;
  for(const item of movingPaths){
   const position=(elapsed/item.duration%1)*4,index=Math.floor(position),blend=(1-Math.cos((position-index)*Math.PI))/2;
   const from=item.numbers[index],to=item.numbers[index+1];
   let n=0;item.path.setAttribute('d',item.values[index].replace(/-?\d+(?:\.\d+)?/g,()=>{const i=n++;return (from[i]+(to[i]-from[i])*blend).toFixed(2);}));
  }
  frame=requestAnimationFrame(tick);
 }
 function sync(){cancelAnimationFrame(frame);last=0;if(!document.hidden&&!motionPaused)frame=requestAnimationFrame(tick);}
 document.addEventListener('visibilitychange',sync);sync();
})();

// Local visual enhancement inspired by glass and interactive bento patterns.
(()=>{
 const paths={overview:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',orders:'M8 5H5v16h14V5h-3M9 3h6v4H9zM8 12h8M8 16h5',workspace:'M4 4h6v6H4zM14 14h6v6h-6zM10 7h7v7',evidence:'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6'};
 for(const link of document.querySelectorAll('[data-nav]')){const holder=link.querySelector('span');const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[link.dataset.nav]);svg.append(path);holder.replaceChildren(svg);}
 const pointer=matchMedia('(hover:hover) and (pointer:fine)'),reduce=matchMedia('(prefers-reduced-motion: reduce)');

 let tilted=null,frame=0;
 const reset=()=>{if(tilted){tilted.style.removeProperty('--tilt-x');tilted.style.removeProperty('--tilt-y');tilted.classList.remove('pointer-tilt');tilted=null;}};
 document.addEventListener('pointermove',event=>{
  if(!pointer.matches||reduce.matches){reset();return;}
  const card=event.target.closest('.task-card,.metrics>div,.welcome-steps>div,.panel');
  if(!card||card.matches(':has(input:focus,textarea:focus,select:focus),:has(.glass-select-trigger[aria-expanded=true])')){reset();return;}
  if(tilted!==card){reset();tilted=card;card.classList.add('pointer-tilt');}
  cancelAnimationFrame(frame);const x=event.clientX,y=event.clientY;
  frame=requestAnimationFrame(()=>{if(tilted!==card)return;const r=card.getBoundingClientRect();card.style.setProperty('--tilt-x',((.5-(y-r.top)/r.height)*2).toFixed(2)+'deg');card.style.setProperty('--tilt-y',(((x-r.left)/r.width-.5)*2).toFixed(2)+'deg');});
 },{passive:true});
 document.documentElement.addEventListener('pointerleave',reset);window.addEventListener('blur',reset);reduce.addEventListener('change',reset);

})();

// Native select remains the data source; the presentation uses a dark glass listbox.
(()=>{
 let opened=null;
 for(const select of document.querySelectorAll('select')){
  const wrapper=el('div',undefined,'glass-select');select.before(wrapper);wrapper.append(select);select.classList.add('select-source');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  const trigger=el('button',undefined,'glass-select-trigger secondary');trigger.type='button';trigger.id=select.id+'-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
  const caption=el('span'),arrow=el('span','⌄','select-chevron');arrow.setAttribute('aria-hidden','true');trigger.append(caption,arrow);wrapper.append(trigger);
  const list=el('div',undefined,'glass-select-menu');list.id=select.id+'-menu';list.setAttribute('role','listbox');list.hidden=true;document.body.append(list);trigger.setAttribute('aria-controls',list.id);
  const label=document.querySelector('label[for="'+select.id+'"]');if(label){label.htmlFor=trigger.id;trigger.setAttribute('aria-label',label.textContent);}else trigger.setAttribute('aria-label',select.getAttribute('aria-label')||select.closest('label')?.firstChild?.textContent||'Select an option');
  let focusIndex=0;
  function close(restore=false){list.hidden=true;trigger.setAttribute('aria-expanded','false');if(opened?.list===list)opened=null;if(restore)trigger.focus();}
  function position(){const r=trigger.getBoundingClientRect();const width=Math.min(r.width,innerWidth-24);list.style.width=width+'px';list.style.left=Math.max(12,Math.min(r.left,innerWidth-width-12))+'px';const height=Math.min(list.scrollHeight,280);list.style.top=(r.bottom+8+height<innerHeight?r.bottom+8:Math.max(12,r.top-height-8))+'px';}
  function options(){return [...list.querySelectorAll('[role=option]:not(:disabled)')];}
  function sync(){caption.textContent=select.selectedOptions[0]?.textContent||'Select an option';trigger.disabled=select.disabled;list.replaceChildren();[...select.options].forEach((option,index)=>{const item=el('button',undefined,'glass-select-option');item.type='button';item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));item.disabled=option.disabled;item.tabIndex=-1;item.append(el('span',option.textContent),el('span',option.selected?'✓':''));item.onclick=()=>{select.selectedIndex=index;select.dispatchEvent(new Event('change',{bubbles:true}));sync();close(true);};list.append(item);});if(select.disabled)close();}
  function open(){if(trigger.disabled)return;opened?.close();sync();list.hidden=false;trigger.setAttribute('aria-expanded','true');opened={list,close};position();const items=options();focusIndex=Math.max(0,items.findIndex(i=>i.getAttribute('aria-selected')==='true'));items[focusIndex]?.focus({preventScroll:true});}
  trigger.onclick=()=>list.hidden?open():close();trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open();}};
  list.onkeydown=e=>{const items=options();if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();focusIndex=e.key==='Home'?0:e.key==='End'?items.length-1:(focusIndex+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[focusIndex]?.focus({preventScroll:true});}else if(e.key==='Escape'){e.preventDefault();close(true);}else if(e.key==='Tab')close(true);else if(e.key.length===1&&e.key!==' '){const i=items.findIndex((item,index)=>index>focusIndex&&item.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase()));const fallback=items.findIndex(item=>item.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase()));focusIndex=i<0?Math.max(0,fallback):i;items[focusIndex]?.focus({preventScroll:true});}};
  select.addEventListener('change',sync);select.addEventListener('ui:sync',sync);new MutationObserver(sync).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected']});sync();
 }
 document.addEventListener('pointerdown',e=>{if(opened&&!opened.list.contains(e.target)&&!e.target.closest('.glass-select-trigger'))opened.close();});window.addEventListener('resize',()=>opened?.close());document.addEventListener('wheel',e=>{if(opened&&!opened.list.contains(e.target))opened.close();},{passive:true});
})();

// Public, immutable receipt links. These are recorded evidence, not live polling.
void fetch('/release-evidence.json').then(r=>{if(!r.ok)throw Error('Receipt manifest unavailable');return r.json();}).then(manifest=>{
 const container=$('public-receipts');if(!container)return;
 for(const [key,title] of [['success','Live Gemini → TEE → confirmed payment'],['refund','Separate v2 expiry · full-principal refund']]){
  container.append(el('h3',title));const links=el('div',undefined,'receipt-links');
  for(const tx of manifest[key]?.transactions??[]){if(!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(tx.hash))continue;const link=el('a',tx.label+' ↗');link.href='https://explorer.testnet.near.org/transactions/'+tx.hash;link.target='_blank';link.rel='noopener noreferrer';links.append(link);}
  container.append(links);
 }
}).catch(()=>{if($('public-receipts'))$('public-receipts').textContent='Recorded receipt links are also available in the Demo guide.';});
