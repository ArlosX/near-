import {invariant} from '../../../packages/shared/src/domain.ts';

// An operator-configured origin, never a forwarded header supplied by a client.
export function validatePublicOrigin(value:string):string {
 let url:URL;try{url=new URL(value);}catch{throw new Error('Invalid PUBLIC_ORIGIN');}
 invariant(url.protocol==='https:'&&url.origin===value&&!url.username&&!url.password&&!url.port
  &&url.hostname.includes('.')&&!/^(localhost|127\.|0\.|\[)/.test(url.hostname),'PUBLIC_ORIGIN must be an exact HTTPS origin without a path or port');
 return url.origin;
}
export function hostingConfig(env:NodeJS.ProcessEnv){
 const raw=env.PUBLIC_ORIGIN||(env.RENDER==='true'?env.RENDER_EXTERNAL_URL:undefined);
 invariant(env.RENDER!=='true'||!!raw,'Render public origin is missing');
 const publicOrigin=raw?validatePublicOrigin(raw):undefined;
 const port=Number(env.PORT??4318);
 invariant(Number.isInteger(port)&&port>=0&&port<=65535,'invalid port');
 return {publicOrigin,port,host:publicOrigin?'0.0.0.0':'127.0.0.1'};
}
