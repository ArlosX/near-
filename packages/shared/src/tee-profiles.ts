export const TEE_MEASUREMENTS={
 'outlayer-tdx-direct-v1':'5fccdb6924dbbe7ab09a4ca412e1b264196e44c47c795774326da89a376e45c3',
 'outlayer-tdx-direct-v2':'d09433697b6795af07f09ba73ec15b4af7e01da08b60e28a5d496a07573a6ceb',
 'outlayer-tdx-direct-v3':'ab0bbc0d27392a4c2a68968141b1ed38cae3e6a88a369d90552622d55b5e732d'
} as const;
export type TeeProfile=keyof typeof TEE_MEASUREMENTS;
export function isTeeProfile(value:unknown):value is TeeProfile {
 return typeof value==='string'&&Object.hasOwn(TEE_MEASUREMENTS,value);
}
