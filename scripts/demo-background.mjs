// Requires the local console server. This runs synthetic fixtures, never payments.
const base='http://127.0.0.1:4317';
async function request(path,body){
 const response=await fetch(base+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Local-Console':'1'},body:JSON.stringify(body)});
 const value=await response.json();if(!response.ok)throw new Error(JSON.stringify(value));return value;
}
const created=await request('/api/orders',{requestId:crypto.randomUUID(),budgetMinor:'2500',lifetimeSeconds:60});
const id=created.value.orderId;
await request('/api/orders/'+id+'/enqueue',{});
for(let attempt=0;attempt<60;attempt++){
 const detail=await request('/api/orders/'+id);
 if(detail.job?.status==='FAILED')throw new Error(detail.job.error);
 if(detail.job?.status==='DONE'){
  if(detail.state.status!=='CHECKS_PASSED_LOCAL'||detail.reports.length!==2)throw new Error('Unexpected result');
  console.log(JSON.stringify({orderId:id,status:detail.state.status,job:detail.job,reports:detail.reports.map(r=>r.reportHash),scope:'synthetic_local_only'},null,2));
  process.exit(0);
 }
 await new Promise(resolve=>setTimeout(resolve,250));
}
throw new Error('Background execution timed out');
