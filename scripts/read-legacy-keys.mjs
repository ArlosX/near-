const response=await fetch('https://rpc.testnet.fastnear.com',{
 method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',
 signal:AbortSignal.timeout(15000),body:JSON.stringify({jsonrpc:'2.0',id:'legacy-key-review',method:'query',params:{request_type:'view_access_key_list',account_id:'arlos.testnet',finality:'final'}})
});
if(!response.ok)throw Error('Legacy key RPC unavailable');
const payload=await response.json();
if(payload.error||payload.id!=='legacy-key-review'||!Array.isArray(payload.result?.keys))throw Error('Finalized legacy key state unavailable');
console.log(JSON.stringify(payload.result.keys));
