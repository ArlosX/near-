# OutLayer attestation validation — 12 November 2026

## Scope and current result

Release roadmap stage 3: independently verify the two owner-signed OutLayer Testnet executions. This is separate from enforcing TEE acceptance in escrow (stage 4) and testing a newly funded order (stages 6–7).

COMPLETE: both executions passed the independent official verifier, including Intel quote verification and exact on-chain payload bindings. Both saved bundles passed offline replay. Eight corrupted copies were explicitly rejected. The original bundles were preserved unchanged.

| Task | Transaction | OutLayer request ID | Attestation task ID |
| --- | --- | --- | --- |
| Extract | `8WPtrn1MGZGjWptANVrG99GTETE1P22wSLjjT3HVmZdr` | 24826 | 62845 |
| Compare | `3MSG5Qaz96km4P1VbuvipHEwXp3tcFo9nRBXFBh73syj` | 24840 | 62860 |

Both calls were signed by `arlosx.testnet` against `outlayer.testnet`. Both ran the published WASM with SHA-256 `bb9fa85b135deb155f187f9ea49df8c907f90b885a88b90459f5bed208122051`.

## Checks already completed

- Exact published WASM bytes match each attestation record's `wasm_hash`.
- SHA-256 of the transaction's `input_data` matches each record's `input_hash`.
- SHA-256 of the decoded transaction `SuccessValue` bytes matches each record's `output_hash`.
- The attestation transaction hash and caller match the actual transaction.
- The verifier's embedded Intel root certificate matches the certificate downloaded independently from Intel: SHA-256 `44a0196b2b99f889b8e149e95b807a350e7424964399e885a7cbb8ccfab674d3`.

Output encoding matters: `response_format: "Text"` returns a JSON-encoded string containing the guest stdout, including its newline. Hash the exact decoded return bytes; hashing the parsed string or trimming its newline changes the commitment.

Local audit data is under `artifacts/local/outlayer-proof/`; original transaction receipts and prepared requests are under `artifacts/local/outlayer-review/`. The binding results are in `payload-bindings.json`.

## Independent verifier

Build the official [out-layer/outlayer-verify](https://github.com/out-layer/outlayer-verify) source at commit `90c27d9d4fc843194ddc6f8ebaafa4eb320c3bb6`, using its unchanged source and locked dependencies. Its Intel quote checks use `dcap-qvl` 0.5.2.

The old default Testnet API returns HTTP 410. Supply `--api https://testnet-api.outlayer.ai`; do not interpret an endpoint migration as an invalid quote.

Example, after building the verifier:

```powershell
& ./artifacts/local/outlayer-verify/target/release/outlayer-verify.exe tx 8WPtrn1MGZGjWptANVrG99GTETE1P22wSLjjT3HVmZdr --network testnet --api https://testnet-api.outlayer.ai --bundle artifacts/local/outlayer-proof/extract.proof.json --json
```

The required checks are Intel signature/collateral validity, current TCB status, worker measurements approved by `worker.outlayer.testnet`, quote report-data binding, and exact transaction input/output commitments. Save the evidence bundle, recompute its verdict offline, and ensure deliberately altered evidence is rejected.

## Trust boundaries

- Approval of a worker measurement remains governed by the OutLayer register account. A valid quote does not decentralize that governance.
- Approved measurements do not by themselves prove a reproducible mapping from the worker binary to reviewed worker source.
- The guest checks deterministic acceptance rules over supplied work and evidence. It does not prove that arbitrary outside sources are truthful or that AI reasoning is correct.
- An offline bundle preserves cryptographic material but its saved chain approval answer is a snapshot, not a NEAR state proof. Online verification reads the approval from RPC; RPC trust and availability remain relevant.
- These two runs replay saved Gemini work. They do not prove that a fresh funded order has completed under a non-bypassable TEE escrow mode.
- No Payment Key, private signing key, or model credential is needed to verify these public records.

## Final results

| Check | Extract | Compare |
| --- | --- | --- |
| Intel authenticity | PASS | PASS |
| TCB status | UpToDate | UpToDate |
| Approved worker measurements | PASS | PASS |
| Quote binds execution fields | PASS | PASS |
| Exact on-chain input | PASS | PASS |
| Exact on-chain output | PASS | PASS |
| Live verifier exit | 0 | 0 |
| Offline replay exit | 0 | 0 |
| Altered input rejected | PASS — exit 1 | PASS — exit 1 |
| Altered output rejected | PASS — exit 1 | PASS — exit 1 |
| Altered WASM hash rejected | PASS — exit 1 | PASS — exit 1 |
| Corrupted quote rejected | PASS — exit 1 | PASS — exit 1 |

Both quotes use V1 commitments, with 5,006-byte TDX quotes. The collateral window covers the executions: `2026-11-08T00:15:55Z` through `2026-12-08T00:15:19Z`. The verifier read the collateral from `worker.outlayer.testnet` at block `276791207`; it matched the API copy byte for byte. There were no reported TCB advisories.

Saved files in `artifacts/local/outlayer-proof/`:

- `extract.verification.json` and `compare.verification.json`: online verdicts and measured values.
- `extract.proof.json` and `compare.proof.json`: self-contained evidence bundles.
- `offline-and-tamper-results.json`: two pristine replays and eight rejection results.
- `check-bundles.cjs`: repeat the offline/tamper checks with `node artifacts/local/outlayer-proof/check-bundles.cjs`.
- `verifier-provenance.json`: pinned source, lockfile, Intel root and compiler checksums.

The verifier source was not modified. Build prerequisites needed repair locally: the GNU compiler was absent from PATH and the existing Visual Studio installation lacked the ordinary runtime library directory. A checksum-verified portable GCC 16.2.0 was extracted under project artifacts; Rust's bundled GNU runtime libraries were supplied through `LIBRARY_PATH`. No system installation or application behavior changed.

Stage 3 is complete for these two executions. Stage 4 remains pending: enforce a frozen TEE acceptance mode in escrow with an authenticated, context-bound result path and adversarial Sandbox tests. No existing escrow has gained those guarantees merely because these proofs passed.
