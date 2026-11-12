# Stage 6 — funded success workflow

Status: in progress, 12 November 2026. The owner must sign each transaction.

## Implemented and checked

- New orders can persist the explicit `outlayer-tdx-direct-v1` mode in the immutable execution configuration. Existing configuration hashes and legacy orders retain their original mode.
- TEE funding uses `create_tee_work_order` with the full canonical agreement. Funding confirmation checks the final transaction's method, signer, receiver, principal and exact arguments, then reads the frozen TEE profile.
- Financial order and TEE metadata are queried at the same finalized block. Code, collateral, worker measurement commitments, frozen agreement and task allocations must match.
- Model execution checks actual on-chain dependency acceptance and exact predecessor artifact hashes. A local pass cannot unlock comparison. A retry waits for the corresponding on-chain revision.
- Each explicit TEE model run produces at most one deliverable, then stops for on-chain preparation/TEE acceptance. Durable model reservations continue preventing duplicate calls after ambiguous provider failures.
- Synthetic queue jobs and the legacy result-recording settlement path are blocked for TEE orders.
- The planner rebuilds a pending execution's exact input from archived evidence and the contract-generated request ID/time. Hash mismatch fails closed. Its local report replay is consistency checking, not hardware verification.
- On-chain result hashes are matched against the guest verification summary, rather than incorrectly comparing them with the richer local report envelope hash.

Validation: 101 app tests, TypeScript and existing syntax checks passed. Three targeted Linux PostgreSQL tests passed, covering legacy model replay, ambiguous provider failure and the new one-result/on-chain-dependency behavior. The new PowerShell runner and TypeScript modules passed syntax checks. Logs: `artifacts/local/stage6-app-check.log` and `artifacts/local/stage6-postgres.log`.

## Prepared fresh order

- Contract: `agentwork-tee-arlosx.testnet`.
- Buyer/verifier/demo recipients: `arlosx.testnet`. This is a same-account demonstration, not independent worker custody.
- Order: `demo-a26e7fad70d6a067cac9440ec43669646886493f84fb1f1c`.
- Agreement hash: `sha256:f5402369da2a035a2dd88d051a614626a7b1b21eec545c52f61bb9bf0366bbbe`.
- Principal: 0.001 Testnet NEAR, split 40% extraction and 60% comparison.
- Sources: the existing synthetic supplier fixture. Live Gemini will generate outputs; the source data itself remains synthetic.
- Funding arguments, agreement and checkpoint: `artifacts/local/stage6-success/`.

The checkpoint prevents accidentally creating another stage-6 order. Funding preparation checks its deadline; do not sign an expired agreement. If it expires unfunded, review the chain and replace it through an explicit reviewed renewal rather than silently changing frozen bytes.

## Owner action now

Run from PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Arlos\Desktop\NEAR\near-agent-work\scripts\stage6-testnet.ps1" -Action Funding
```

The runner rechecks the deployment code hash, loads the immutable owner-scoped order, regenerates funding arguments and invokes the existing official CLI with keychain signing. Review `create_tee_work_order`, signer `arlosx.testnet`, receiver `agentwork-tee-arlosx.testnet`, 0.001 NEAR and 80 Tgas. Select `send` yourself. No final `send` argument is supplied by the runner.

After the owner supplies the transaction ID, verify it with:

```powershell
node --env-file=.env.local scripts/stage6-success.ts --confirm-funding TRANSACTION_ID
```

The next explicit steps are a single Gemini extraction, contract request preparation, OutLayer execution, direct quote submission, then comparison using the accepted predecessor, final allocation and actual withdrawal. Only the first funding signature is currently requested.

## Not yet claimed

Funding confirmed against final Testnet receipt `64pgPoAYdtf9qSpFejmPVuhhWYEYCvX7QJkoP7sKyQNM`, including exact signer, receiver, principal, method, agreement arguments and frozen TEE profile. Gemini extraction was attempted but its first request timed out after 20 seconds; no report was saved. A read-only authenticated model lookup returned HTTP 200. One explicit, durably reserved recovery succeeded: a real Gemini extraction produced artifact `sha256:da6051af958ec335187ea820cf85b97cb0871da13ebaa47a4005543f75a21e75` and an accepted local report. `prepare_tee_request` has been generated with zero deposit and 80 Tgas. It awaits the owner signature; this local result is not TEE acceptance. No new TEE execution, acceptance, allocation or withdrawal has been confirmed. Existing historical TEE bundles cannot authorize this fresh order. The global console configuration has not been switched: remaining UI wiring, execution dispatch/proof transport and withdrawal reconciliation must be completed and verified before stage 6 is marked complete.

## Extraction request prepared on-chain

Owner transaction `rbnzbtfYwYQBDLNGYKNZZpBaLqQSgCoCUwLxtZsxggA` finalized successfully for `prepare_tee_request`, zero deposit, exact approved arguments, signer `arlosx.testnet` and escrow receiver. Contract-generated request ID is `tee-1`. Pending input was reconstructed and matched the chain commitment. OutLayer `estimate_execution_cost` returned `4000100000000000000000` yoctoNEAR (0.0040001 Testnet NEAR); the 100 Tgas `request_execution` intent is prepared, not sent. Owner runner action: `Execute`. Review saved in `artifacts/local/stage6-success/extract-execution-review.json`.

## Extraction TEE execution verified

Execution transaction `FhLjnm59djPbQE4P4KSostm4qJpUAiqDhbDqijsbm5qu` finalized successfully. Official independent verifier passed Intel signature chain/UpToDate TCB, approved worker identity, report-data commitments and exact transaction input/output recovery; attestation task ID 76032. Collateral matches the contract-pinned digest. Execution receipt matches the reviewed caller, target, method, deposit and exact arguments; guest verification matches the archived Gemini report summary and reconstructed pending input. The zero-deposit `submit_tee_result` packet is prepared at 300 Tgas; owner runner action `Proof`. Escrow acceptance remains pending. Proof and verification files are saved under `artifacts/local/stage6-success/`.

Supabase returned intermittent 429/500 download errors during reconciliation. Proof preparation now reuses hash-verified immutable bytes only within one command and retries unavailable downloads at most twice; integrity/context failures are never bypassed. TypeScript, proof transport tests and PowerShell syntax passed.

### Proof prepayment adjustment

The first proof transaction was rejected by the CLI before submission: owner balance 0.240204064882305 NEAR versus 0.3011412731625415 NEAR maximum transaction cost at 300 Tgas. No chain failure was claimed. Stage-6 proof signing now caps prepaid gas at 220 Tgas, preserving ~25 Tgas over the measured production proof-helper benchmark (~195 Tgas). Intel/context validation and zero deposit remain unchanged. This is a benchmark-based budget, not a guarantee of the exact live gas consumption. Future steps must recheck signer liquidity.

## Extraction accepted by the live escrow

Transaction `64zFqT3fR9Ly7YDQLxoUvGoabqLNAryCKyQSSeopS7yS` finalized successfully. Exact signer/receiver/zero-deposit/proof arguments matched the prepared packet. Contract returned accepted and emitted tee_result_verified for extraction, request tee-1 and attestation 76032. Live receipt gas burned was 213.130157064938 Tgas (full stateful escrow path, versus ~195 Tgas stateless helper benchmark). The 220 Tgas budget succeeded for this packet; future quotes must not assume the stateless benchmark equals full transaction gas. Comparison may now consume the exact accepted predecessor.

### Comparison provider interruption

After transient Supabase Storage 429/500 connection-limit errors, immutable evidence reads recovered. Comparison started only after chain acceptance of extraction. The initial Gemini comparison request timed out; its single explicit durable recovery returned HTTP 503. No comparison artifact/report or TEE preparation is claimed. Stop additional automatic model retries; inspect provider availability and the persisted reservations before an explicit recovery. Extraction acceptance and principal escrow remain on-chain. The immutable result cutoff remains 2026-11-12T14:50:52.490Z; after it, do not fabricate a success or modify the agreement, use the expiry/full-refund path.

## New-profile expiry/refund completed

Expiry MvqpPHLC22u4qjjZrKgNFFo7VGkFdyMV2rECRx19eL4 and refund 59CgKUj3T8k32zPyfPYhGW9Jm8Z4sfoTFBUc2BxgBCz4 finalized successfully. The refund callback returned the full 0.001 NEAR principal and the final TEE order view confirmed refunded=true, with no failed receipts. This proves incomplete-work expiry/refund; a separate live rejected-artifact scenario is not claimed.

New agreements now support up to six hours. Named operator run directories preserve historical evidence. Future proof commands use 250 Tgas, unchanged deployed contract code. Signer balance is below the 0.3 NEAR operating target; a 0.1 NEAR owner-reviewed operator top-up is prepared only after proving no outstanding liabilities and preserving the next-slot reserve plus fee headroom. No top-up has been sent by the assistant.

## Controlled second success attempt prepared

Operator top-up transaction DeERkNAo4mwrAHeriWFUePt4n1Foq46pKMvYUDv5BQr5 finalized with exactly 0.1 Testnet NEAR transferred to arlosx.testnet. Preflight confirmed signer balance 0.3187082915349547 NEAR and positive operator reserve headroom after the second slot. New six-hour agreement demo-9232242654698a762c17493d9dc79c4c9662ef425d531dc6 is saved in the separate stage6-success-final run directory; funding is prepared only. Its cutoff is 2026-11-12T21:47:16.381Z. Old agreement and evidence remain unchanged.

### Second-attempt funding and explicitly recorded replay

Funding 4XjDVLdX3zfdYUQx6kcCKGaZbFpZ7PSHUAiUT6uQeABU finalized with exact new agreement arguments, 0.001 NEAR principal and TEE profile. Gemini extraction returned HTTP 403. Instead of silently changing providers or claiming fresh inference, the owner-approved fallback uses unchanged artifacts from the successful recorded Gemini run demo-3610a04d-cc17-47ef-ba4c-a5e72dd5b168. Replay validation checks source report integrity, original successful completion bytes, identical sources/policy, version and exact predecessor hashes. A model.replay.imported event labels provenance; no new model.response event is fabricated. Extraction replay passed local verification with zero new inference calls. Its new TEE preparation still requires owner signature. UI explicitly labels recorded replay. TypeScript and tampered replay checks passed.
