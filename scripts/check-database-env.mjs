const value=process.env.DATABASE_URL;
let configured=false;
if(value?.trim()){
 try{const u=new URL(value);configured=['postgres:','postgresql:'].includes(u.protocol)&&Boolean(u.hostname)&&!value.includes('[YOUR-PASSWORD]');}catch{}
}
console.log(JSON.stringify({configured,networkCalls:0,remoteMigrationsApplied:false,note:configured?'Connection syntax present; credentials and TLS not validated':'DATABASE_URL left unconfigured as requested'},null,2));
