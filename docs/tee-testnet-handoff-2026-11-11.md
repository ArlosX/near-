# OutLayer Testnet execution handoff — 11 November 2026

## Completed

The existing independent WASI judge was executed locally on the two actual Gemini deliverables from order `demo-3610a04d-cc17-47ef-ba4c-a5e72dd5b168`. Both decisions and all check identities/results matched the Node reference. The review bundle is under `artifacts/local/outlayer-review/` followed by that order ID. It contains the WASM file, exact guest stdin, local outputs and a manifest.

Judge SHA-256 is `bb9fa85b135deb155f187f9ea49df8c907f90b885a88b90459f5bed208122051`.

The Testnet `outlayer.testnet` cost estimator responded to a read-only query with `4000100000000000000000` yoctoNEAR for one billion instructions, 128 MiB, 30 seconds and 10,000 input bytes. That is 0.0040001 test NEAR. Our two guest inputs were 3,658 and 5,130 bytes. A fresh estimate is required before signing. Transaction gas and actual compilation/execution behavior remain separate considerations.

## Remote execution gate

Publish only `judge.wasm` at an HTTPS URL on port 443, such as a dedicated public repository artifact or a Testnet FastFS upload. Publishing to an owner-controlled service requires its login/owner approval. The current bundle contains a copied WASM artifact ready for review.

After publishing, regenerate the exact requests with

```powershell
node scripts/prepare-outlayer-review.mjs artifacts/local/gemini-live-evidence.json https://YOUR-PUBLISHED-HOST/judge.wasm
```

The script runs local conformance before producing the two request JSON files. Before the owner signs, fetch the published file and independently confirm its SHA-256. Review the Testnet receiver, limits, exact stdin and quoted cost. Then execute `request_execution` using the owner wallet/CLI. This path uses test NEAR directly and requires no HTTPS Payment Key.

The existing replay uses historical report evaluation times. Its remote execution would demonstrate the judge checking saved work. A fresh escrow request must independently bind current time, task version, accepted predecessors, cutoff and one-time request consumption.

## Remaining settlement and attestation gates

Obtain actual execution receipts and attestation evidence. Verify worker registration/measurements and exact code/input/output bindings. Inspect the deployed platform trust path before making the callback authoritative. The reviewed GitHub source's `resolve_execution` uses `assert_operator`; source inspection of a moving branch alone cannot prove the deployed operator's signing key is hardware-bound or exclusively authorized. The main source was inspected as interface reference, without asserting a deployed-code match.

Only after that trust path is established should a fresh contract profile accept the authenticated result. It must refuse ordinary verifier bypass, replay, stale task versions, changed commitments, late results and terminal orders. Callback failure must preserve refund eligibility. Sandbox tests and a fresh Testnet deployment are required for this change in settlement authority.

## Present status

Local real-output conformance passed. Testnet estimator availability confirmed. Public WASM URL, owner-signed remote execution, verified attestation and TEE-only escrow acceptance remain pending. No remote job, publication or financial transaction was performed in this pass.

References

- https://app.outlayer.ai/docs/near-integration
- https://app.outlayer.ai/docs/tee-attestation
- https://app.outlayer.ai/docs/trust-verification
- https://github.com/out-layer/outlayer
