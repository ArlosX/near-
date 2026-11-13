# Separate worker profile v2 — 13 November 2026

## Trigger and trust decision

Fresh OutLayer execution 733myqUVWnNzE2LabJ64ao6c3wqQmUxTmSb5YgHWaVgn produced a genuine Intel TDX quote. The official verifier confirmed UpToDate TCB and current approval by worker.outlayer.testnet. RTMR3 differs from the immutable v1 pin, so the v1 escrow correctly refused acceptance. No quote verdict flag overrides that check. The owner approved a separate deployment instead of mutating the funded agreement.

- v1 aggregate: 5fccdb6924dbbe7ab09a4ca412e1b264196e44c47c795774326da89a376e45c3
- v2 aggregate: d09433697b6795af07f09ba73ec15b4af7e01da08b60e28a5d496a07573a6ceb
- Digest covers MRTD and RTMR0–RTMR3, in that order, as raw bytes.
- Judge code, Intel root, collateral, expiry, economic rules and exact input/output/context checks are unchanged.
- Cargo feature tee-worker-v2 selects the separate outlayer-tdx-direct-v2 profile. Default builds retain v1.

## Reviewed new artifact and account

Account: agentwork-tee-v2-arlosxq.testnet. Client/verifier/recipients for the owner-controlled demo: arlosxq.testnet.

WASM: 1,302,592 bytes. SHA-256: 274296abcc09740dedd3fc68559e13a79b2bd47dcdc63f148486a18ca1f0c9ec. NEAR code hash: 3eFnuWdxJXzvSdMYXYzUYZFvoHFqxfBbk1CUxdWA58hH.

Owner top-up DHNAgvQwsaLbVEqjmAtvZFkgPhvjxmrU2TAM1Ue3MT8C transferred exactly 4.25 Testnet NEAR to the fresh account after its 10 NEAR sponsorship. This is operator storage capital, not customer escrow principal.

## Verification and reproducibility

Native financial tests: 12 passed. Application checks: 114 passed, strict TypeScript and syntax passed. Real-quote production-helper conformance: fresh quote accepted, v1 worker rejected, modified quote rejected. All 16 financial/adversarial Sandbox scenarios were covered: 15 passed in the full run; the context-forgery fixture initially used an old-worker quote, was corrected to the v2 quote, and its targeted repeat passed. No production contract logic was changed for that correction. The financial Sandbox results and deployment review are recorded under artifacts/local/worker-profile-v2; do not claim public deployment before checking its receipt.

Windows-to-WSL argument forwarding must supply both NEAR_SANDBOX_BIN_PATH and NEAR_SANDBOX_BINARY_PATH as explicit absolute directory values. Earlier runs accidentally resolved the bundled old runtime and failed with Deserialization. A diagnostic probe using the explicit 2.14.0 runtime successfully initialized both the original on-chain bytes and new WASM. Keep failed logs as diagnostics; do not count them as passing runs.

Before deployment, scripts/review-worker-v2.mjs requires the reviewed binary digest, all 16 Sandbox tests, three crypto conformance cases, an empty fresh account and at least 14.25 NEAR operator funding. scripts/deploy-worker-v2.ps1 prepares only owner-reviewed deployment/new with zero attached deposit and never appends send.

## Existing funds and honest limits

The original v1 contract and order demo-36131cc312efd998bae0d054928a60d033444079c4d36e4a are unchanged. Its pending result cannot be force-accepted; if it remains incomplete, use its original expiry/refund path. Do not re-label the v1 quote rejection as a successful settlement.

A v2 run uses stage6-success-live-v2 and the reviewed new contract/code/profile together. Historical v1 runs remain isolated. Future worker changes may require another review; a newly approved registry worker is not automatically accepted by a frozen profile. Deployment authority and OutLayer registry governance are still trust boundaries.
