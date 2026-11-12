# Stage 4 — direct TDX proof gate

Local implementation and stage-4 gates complete, 12 November 2026. Existing public escrow deployments have not changed. A fresh owner-signed deployment and genuinely funded TEE success/failure flows remain stages 5–7.

## Reason for the trust-path change

The documented OutLayer callback route authenticates the platform response, not independently the Intel execution quote. Public Testnet key-list reads on 12 November 2026 showed one FullAccess key on `outlayer.testnet` and three on `worker.outlayer.testnet` (snapshots under `artifacts/local/outlayer-proof/`). The reviewed `resolve_execution` implementation authorizes the operator predecessor. This is an administrative trust boundary; a callback alone cannot establish that only hardware-attested execution authorized a payment.

Current approach: a designated verifier records final task verdicts; the proposed callback route would substitute OutLayer platform authorization.

Implemented alternative: escrow verifies the Intel TDX execution quote itself, against a compiled Intel root and an immutable, explicitly pinned worker/collateral profile. Permissionless proof transport grants no verdict authority. The existing financial state machine and pull withdrawals remain.

Problem solved: the old verifier, relayer or platform callback cannot simply assert acceptance. Implementation cost: additional Rust cryptographic dependencies, larger Wasm/storage reserve, gas benchmarking, and adversarial integration tests. MVP impact: a separate frozen funding entry point and prepare/prove sequence; normal financial methods remain. The on-chain cost gate passed without weakening signature, certificate, revocation, measurement or binding checks.

## Fixed profile and limits

- Published judge Wasm: `bb9fa85b135deb155f187f9ea49df8c907f90b885a88b90459f5bed208122051`.
- Intel root SHA-256: `44a0196b2b99f889b8e149e95b807a350e7424964399e885a7cbb8ccfab674d3`.
- Intel-signed collateral SHA-256: `2e80992e78a9e76e5726db22b7399c553439574e6fe512a3b311ae4c3d559140`.
- Hash of all five verified worker measurements: `5fccdb6924dbbe7ab09a4ca412e1b264196e44c47c795774326da89a376e45c3` (concatenated raw MRTD, RTMR0, RTMR1, RTMR2, RTMR3).
- Pinned profile is Testnet MVP only. It intentionally sacrifices transparent worker/collateral rotation: a changed approved profile requires a separately reviewed deployment. No funded downgrade or operator profile setter exists.
- Funding rejects a cutoff at or beyond `2026-12-08T00:15:19Z`, the pinned collateral's end. The fixed measurement pin represents the reviewed build; it does not automatically follow later registry governance changes or vulnerability revocations. Hardware/vendor and reviewed-worker correctness remain trust assumptions.
- Verification uses the current block time for collateral validity, requires UpToDate TCB with no advisories, and binds a quote timestamp to the pending request's preparation time and current block time.
- Only the V1 `execute` + WasmUrl + `wasm32-wasip2` + no project/secrets + zero-USD preimage shape is supported. No legacy fallback or user-selected attestation algorithm.

## Implemented flow

1. `create_tee_work_order`: canonical full agreement commits economics, sources, task policies, graph, verifier and cutoff at funding. An immutable marker blocks `record_subtask_result` for that order.
2. `prepare_tee_request`: only the fixed work verifier can submit the work payload. Contract checks the frozen agreement, policy/sources, revision and actual accepted predecessor artifacts. It generates request ID and evaluation time, then commits exact judge input bytes before remote execution. No decision is submitted here.
3. Execute those exact returned bytes on OutLayer with the pinned Wasm. The existing execution toolchain can transport the request; transport is not trusted to decide the result.
4. `submit_tee_result`: anyone can supply proof bytes. Contract checks output encoding, pending request context, source/policy/artifact hashes and revision; then independently verifies Intel signatures, TCB, worker measurements and signed execution preimage. Only then may a final result enter the existing state machine. A revision request consumes that attempt without paying anyone.
5. Existing all-task finalization, real withdrawal, expiry and full refund apply. Missing or invalid evidence never earns partial credit. Pending infrastructure work can be rerun with the same exact input; expiry remains the escape path.

## Validation completed

- 96 application tests passed, including three new proof-transport tests; TypeScript and syntax checks passed.
- 12 native financial-core tests passed.
- All 15 Sandbox scenarios passed together. Ten preserve the existing financial/transfer/admission/reserve guarantees; five exercise TEE funding, verifier bypass, agreement/contract/order/task/policy/source/revision substitution, unaccepted dependencies, duplicate pending requests, consistently rehashed forged acceptance, rollback, expiry and full refund without partial payment.
- After the final canonical-number and collateral-window funding guards were added, the affected funding scenario passed again against the final artifact.
- Two genuine historical Intel TDX quotes passed the NEAR-native crypto harness. Corrupted quote bytes and Intel collateral signatures failed for both tasks.
- The same production `validate_proof` and `verify_crypto` functions passed full historical output/preimage conformance for both tasks in Sandbox. They consumed **195.142126543996 Tgas** (extract) and **195.390892773001 Tgas** (compare), including the harness transaction/receipt overhead. These are stateless proof-helper measurements, not a claim about a completed funded settlement or maximum-capacity gas.

The first pure-software, size-optimized benchmark exhausted 300 Tgas. The supported DCAP configuration extension now uses NEAR `p256_verify` and `sha256` for direct quote-signature operations, retaining the library's audited DER/X.509 parsing and certificate-chain/revocation validation. Upstream certificate-chain signature operations still run through its library backend. Speed optimization (`opt-level = 3`) supplies gas headroom; no validation step was removed. Sandbox and live Testnet protocol configuration expose the required P-256 host function.

Fresh valid signatures cannot be manufactured locally for a new order. Accordingly, historical proof conformance and fresh-order adversarial/refund tests are separate: this stage does **not** claim a fresh funded TEE acceptance, payout, or live refund. Those remain stages 6–7, using new owner-approved transactions and actual quotes.

Final escrow Wasm: **1,302,590 bytes**, SHA-256 `695a948fdffd50eef8f17964ad0177d89d934193fd103459a866617fcdb25b63`. Its operator envelope is 2MiB plus 16KiB per order; principal is never used as storage/compute reserve. At the currently used storage price, the base envelope alone is 20.97152 NEAR. Verify live deployment costs and headroom before signing.

Local evidence: `artifacts/local/sandbox-latest.log`, `artifacts/local/tee-funding-final.log`, `artifacts/local/tee-crypto-final.log`, `artifacts/local/outlayer-proof/onchain-crypto-benchmark.json`, and the benchmark receipt JSON files. Public synthetic quote fixtures are included under `tests/fixtures/tee/` so conformance does not depend on the coordinator retaining the API records.

## Reproduction and transport

Build with `npm run contract:build`, run native tests with `npm run contract:test`, and run `bash scripts/run-sandbox.sh` inside Linux/WSL. For the crypto harness, set the same pinned Sandbox environment variables used in that script, then run the Linux Node binary against `tests/sandbox/tee-crypto-bench.mjs`. The harness contract is TEST ONLY and must never be deployed as escrow.

After a new pending request has actually been executed, normalize its saved OutLayer bundle without signing or sending anything:

```text
node scripts/prepare-tee-proof.mjs BUNDLE.json ORDER_ID TASK_ID OUTPUT-ARGS.json
```

The file contains arguments for `submit_tee_result` (300 Tgas, zero attached deposit). Its status is preparation only. The tool ignores stored bundle verdicts; the contract must verify the Intel proof and match its own pending context. Historical fixtures cannot be reused for a new pending order.

## Remaining deployment boundaries

The old designated-verifier profile remains available only as an explicit separate mode. A frontend/adapter must check `get_tee_state` and fund using `create_tee_work_order` to claim TEE enforcement; switching a contract address alone does not enable that mode. The current demo has not been silently switched.

As with other upgradeable NEAR contracts, whoever retains the escrow account's FullAccess/deployment keys can replace its code. The no-downgrade guarantee describes this reviewed contract's methods; deployment-key custody is a separate owner-controlled stage-5 decision. No keys were deleted, exposed or used to deploy in this stage.

## References

- [OutLayer trust architecture](https://app.outlayer.ai/docs/trust-verification)
- [OutLayer NEAR callback integration](https://app.outlayer.ai/docs/near-integration)
- [Official independent verifier](https://github.com/out-layer/outlayer-verify), pinned commit in stage 3 report.
- [Intel provisioning root](https://certificates.trustedservices.intel.com/Intel_SGX_Provisioning_Certification_RootCA.cer)
