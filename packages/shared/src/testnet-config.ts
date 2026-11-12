import {account, invariant} from './domain.ts';

export function testnetEscrowConfig(env: NodeJS.ProcessEnv) {
  const contractId = env.NEAR_CONTRACT_ID?.trim() || 'arlos.testnet';
  const verifier = env.NEAR_VERIFIER_ACCOUNT_ID?.trim() || undefined;
  invariant(!env.NEAR_NETWORK || env.NEAR_NETWORK === 'testnet', 'Only NEAR Testnet is supported');
  account(contractId, 'Testnet escrow');
  invariant(contractId.endsWith('.testnet'), 'Use a named .testnet escrow account');
  if (verifier) {
    account(verifier, 'Testnet verifier');
    invariant(verifier !== contractId, 'Escrow cannot be its own verifier');
  }
  const verificationMode=env.NEAR_VERIFICATION_MODE?.trim() || undefined;
  invariant(verificationMode===undefined || verificationMode==='outlayer-tdx-direct-v1','Unsupported NEAR verification mode');
  invariant(!verificationMode || !!verifier,'TEE mode requires an explicit verifier');
  return {contractId, verifier, verificationMode:verificationMode as 'outlayer-tdx-direct-v1'|undefined};
}
