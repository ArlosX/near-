import type {TeeProfile} from './tee-profiles.ts';
import {resolve} from 'node:path';
import {invariant} from './domain.ts';
export function operatorRun(env:NodeJS.ProcessEnv=process.env){
 const name=env.NEAR_WORK_RUN?.trim()||'stage6-success';
 invariant(/^stage6-success(?:-[a-z0-9-]{1,30})?$/.test(name),'Invalid operator run name');
 const actor=env.NEAR_WORK_ACTOR?.trim()||'arlosx.testnet';
 invariant(['arlosx.testnet','arlosxq.testnet'].includes(actor),'Unreviewed operator account');
 const profile=env.NEAR_WORK_PROFILE?.trim()||'outlayer-tdx-direct-v1';
 invariant(profile==='outlayer-tdx-direct-v1'||profile==='outlayer-tdx-direct-v2'||profile==='outlayer-tdx-direct-v3','Unreviewed operator profile');
 const v2=profile==='outlayer-tdx-direct-v2';
 const v3=profile==='outlayer-tdx-direct-v3';
 invariant(!v2||(['stage6-success-live-v2','stage6-success-live-v2-final'].includes(name)&&actor==='arlosxq.testnet'),'V2 requires its separate run and reviewed owner');
 invariant(!v3||(name==='stage6-success-live-v3'&&actor==='arlosxq.testnet'),'V3 requires its separate run and reviewed owner');
 return {name,actor,profile:profile as TeeProfile,contract:(v2||v3)?'agentwork-tee-v2-arlosxq.testnet':'agentwork-tee-arlosx.testnet',codeHash:v3?'8WawYEgDE9erqwNJ2yhjJEnTobVbTm95vUbG7mkntsDx':v2?'3eFnuWdxJXzvSdMYXYzUYZFvoHFqxfBbk1CUxdWA58hH':'4eaQHrw1xjUjtHjJg329UvV65t7UoWzTkKUKN4vS9JvM',folder:resolve(import.meta.dirname,'../../../artifacts/local',name)};
}
