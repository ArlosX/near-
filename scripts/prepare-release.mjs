import {readdir,readFile,mkdir,writeFile,copyFile,lstat} from 'node:fs/promises';
import {resolve,relative,dirname,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const target=resolve(root,'artifacts/local/release/source-'+new Date().toISOString().replace(/[:.]/g,'-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const folders=['apps','contracts','docs','packages','scripts','supabase','tests','.cargo'];
const top=['LICENSE','README.md','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','.gitignore','.gitattributes','.env.example','render.yaml'];
const excluded=new Set(['node_modules','target','.git','artifacts','coverage','dist','.next']);
const files=[];const findings=[];const knownSecrets=[];
try{for(const line of (await readFile(resolve(root,'.env.local'),'utf8')).split(/\r?\n/)){
 const m=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);if(!m||!/(KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL)$/.test(m[1]))continue;
 const value=m[2].replace(/^['"]|['"]$/g,'');if(value.length>=16)knownSecrets.push(value);
}}catch(e){if(e.code!=='ENOENT')throw e;}
async function visit(path){
 const info=await lstat(path);if(info.isSymbolicLink())throw Error('Release refuses symlinks: '+relative(root,path));
 if(info.isDirectory()){if(excluded.has(path.split(sep).at(-1)))return;for(const entry of await readdir(path))await visit(resolve(path,entry));return;}
 const rel=relative(root,path);if(rel.startsWith('..')||!info.isFile())throw Error('Invalid release entry');
 const name=path.split(sep).at(-1);if(name.startsWith('.env')&&name!=='.env.example')return;
 if(['.log','.sqlite','.db','.pem','.key','.zip'].includes(extname(path)))return;
 const bytes=await readFile(path);
 if(!['.wasm','.der','.ttf','.woff','.woff2','.png','.jpg','.ico','.pdf'].includes(extname(path))){
  const text=bytes.toString('utf8');
  if(knownSecrets.some(value=>text.includes(value)))findings.push({path:rel,reason:'configured secret literal'});
  if(/ed25519:[1-9A-HJ-NP-Za-km-z]{80,90}(?![1-9A-HJ-NP-Za-km-z])/.test(text))findings.push({path:rel,reason:'possible private signing key'});
 }
 files.push({path:rel.replaceAll('\\','/'),bytes,sha256:sha(bytes)});
}
for(const folder of folders)await visit(resolve(root,folder));for(const file of top)await visit(resolve(root,file));
if(findings.length){console.error(JSON.stringify({status:'BLOCKED_SECRET_SCAN',findings},null,2));process.exitCode=1;}
else{
 await mkdir(target,{recursive:true});for(const file of files){const out=resolve(target,file.path);await mkdir(dirname(out),{recursive:true});await copyFile(resolve(root,file.path),out);}
 await writeFile(resolve(target,'SOURCE-MANIFEST.json'),JSON.stringify({createdAt:new Date().toISOString(),files:files.map(({path,sha256})=>({path,sha256})),secretScan:'configured secrets and private-key patterns absent; manual review still required'},null,2)+'\n');
 const report={status:'PREPARED_NOT_PUBLISHED',target,files:files.length,bytes:files.reduce((n,x)=>n+x.bytes.length,0)};
 await writeFile(resolve(root,'artifacts/local/release/latest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
