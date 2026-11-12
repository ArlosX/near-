import {resolve} from 'node:path';
import {invariant} from './domain.ts';
export function operatorRun(env:NodeJS.ProcessEnv=process.env){
 const name=env.NEAR_WORK_RUN?.trim()||'stage6-success';
 invariant(/^stage6-success(?:-[a-z0-9-]{1,30})?$/.test(name),'Invalid operator run name');
 return {name,folder:resolve(import.meta.dirname,'../../../artifacts/local',name)};
}
