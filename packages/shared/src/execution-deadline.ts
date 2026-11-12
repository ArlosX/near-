import {invariant} from './domain.ts';
export const MAX_EXECUTION_SECONDS=21600;
export function validateExecutionLifetime(seconds:number){
 invariant(Number.isInteger(seconds)&&seconds>=1&&seconds<=MAX_EXECUTION_SECONDS,'lifetime must be 1–21600 seconds');
 return seconds;
}
