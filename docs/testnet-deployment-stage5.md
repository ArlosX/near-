# Stage 5 — fresh Testnet deployment

Status: COMPLETE — owner account creation, top-up, deployment, initialization, admission, code hash and live reserve gates passed. No deployment/funding transaction has been sent by the agent. Application TEE-mode wiring and a fresh funded workflow remain stage 6.

## Confirmed account

- Contract account: `agentwork-tee-arlosx.testnet` (a new independent project contract account, sponsored through the official CLI's helper route).
- Creation transaction: `7KJBJKNrpiy3yW9nM9eYGk2ufkAJd3b6dh3P2CKKz9KL`.
- Final chain receipt: successful creation, 10 NEAR Testnet transfer, one FullAccess key.
- Expected public key: `ed25519:8maZW6ssvFe5daifFW5U8XErRq4sM1WNW8ynHJSrKjjT`. Private material stays in the owner's keychain.
- Read-only preflight showed no deployed code, 10 NEAR on the new account and approximately 4.4949 NEAR on `arlosx.testnet`.
- Owner top-up transaction `Ds31VtaW6WkvxuzCP8WpYZ5zYcujLYuwFm4wFAwCruw2` was verified successful: exactly 4.25 Testnet NEAR from `arlosx.testnet` to the new contract account. Final-state balance is 14.25 NEAR; code is still empty. Receipt saved in `artifacts/local/deployment-review/topup-receipt.json`.
- Owner deployment transaction `6ettRgXCJDGa7MHGjNZ94BMLTdKeDVxN2WH8VxKKwnTc` succeeded with deployment plus `new({})`, zero attached deposit. RPC returns the deployment code's 32-byte digest in this transaction view, not the full Wasm; that digest matches the reviewed SHA-256 and the live account code hash independently matches the expected base58 value. `get_accounting` confirms initialization, zero principal/credits/transfers/orders and the 1,376,256-byte base reserve. `arlosx.testnet` is not yet admitted. Evidence is in `deploy-receipt.json` and `deploy-verification.json` under the review directory.
- Owner admission transaction `Dm6c37mr5FGvZ7X6WF2HLztL8Arbbv5xtUqyRZiCyrBb` succeeded with exactly `set_client_admission({client:"arlosx.testnet",allowed:true})`, zero deposit. A subsequent view confirms admission is true. Code hash still matches; all financial totals and order count remain zero. The final account snapshot has 14.2400746997797102 NEAR and 1,303,028 storage bytes; actual usage plus the 4,096-byte overhead fits the base envelope. Final evidence is in `admission-receipt.json`, `deployed-account.json` and `stage5-final-verification.json` under the review directory.

## Budget amendment

The previous 2MiB operator envelope was conservative, not a requirement imposed by the cryptographic verifier. The measured release is 1,302,590 bytes. BASE_STORAGE is now **1,376,256 bytes**, leaving approximately 73KB before the separate per-order storage allowance. The 4,096-byte runtime overhead check, actual-usage check, 16KiB per-order envelope, principal conservation and pending-transfer liquidity checks remain unchanged. No code, certificate, signature or TEE check was removed.

At the tested storage price, the base envelope is **13.76256 NEAR**; each lifetime order adds 0.16384 NEAR of reserve. The proposed operator budget is **14.25 NEAR**, provided by the 10 NEAR sponsored account plus a separately owner-approved **4.25 NEAR Testnet** transfer from `arlosx.testnet`. Customer order deposits remain separate liabilities.

This is deliberately a small demo budget, not funding for all 64 lifetime order slots. With the tested balance, two slots fit; an unfunded additional reserve is rejected atomically. Further orders may require an operator top-up. Order expiry/refunds do not reclaim lifetime storage slots.

## Validation

Final lean artifact SHA-256: `363351675e1a6f5bd3c5809082372be901b302476357ebb8cae0b87104991caa`.

Expected NEAR base58 code hash: `4eaQHrw1xjUjtHjJg329UvV65t7UoWzTkKUKN4vS9JvM`.

Three targeted Sandbox scenarios passed against this artifact:

1. Storage-reserve failure rolls back order/principal writes and recovers after a genuine reserve donation.
2. Missing TEE evidence expires to a complete principal refund; no partial worker payout.
3. A fresh 14.25 NEAR deployment initializes, admits the client, funds two TEE orders and prepares work; a third order cannot borrow their principal for storage; both original orders then receive successful full refunds.

Evidence: `artifacts/local/tee-lean-budget-sandbox.log` (3 passed, 0 failed). The existing full stage-4 suite and cryptographic conformance remain recorded separately in `tee-escrow-stage4.md`; only the operator reserve constant changed in this amendment.

## Owner-controlled sequence

Use `scripts/stage5-testnet.ps1` with one explicit action at a time:

- `-Action Fund`: verify the exact newly created public key/account and starting balances; prepare only the 4.25 NEAR Testnet top-up. The official CLI asks the owner to choose `send`.
- `-Action Deploy`: verify the reviewed binary/source hashes and funding; prepare code deployment plus one-time `new` on this fresh account. It refuses an automatic upgrade or reinitialization.
- `-Action Admit`: prepare the private client-admission call, signed as the new contract account.
- `-Action Check`: read-only code hash, initialization/accounting and admission verification. An expected pre-deployment check confirmed key/source checks and stopped with "Reviewed code is not deployed"; it signed nothing.

The runner never reads/exports private keys and never appends automatic `send`. It does not edit the application environment or silently switch legacy funding to TEE mode. The historical `arlos.testnet` contract is not a deployment target.

The review manifest is prepared by `node scripts/prepare-deployment.mjs agentwork-tee-arlosx.testnet`. Full source/binary fingerprints and instructions are under `artifacts/local/deployment-review/`.
