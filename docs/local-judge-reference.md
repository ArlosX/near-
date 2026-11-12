# Local deterministic judge reference

Status: Node.js reference and separate Rust WASI judge implemented and tested locally. The reference returns full reports. The WASI implementation returns decisions, check results and context commitments. Remote OutLayer execution and hardware-attestation validation remain pending.

## Do this → see this

```powershell
npm run judge:demo
```

See seven named outcomes: valid extraction, wrong total, fabricated price, repaired extraction, valid comparison, changed predecessor facts and false no-eligible conclusion. Each line includes input, source-code and output commitments and `attested:false`. Input/output files and source manifest are written to `artifacts/local/judge-reference/`.

To execute a saved request independently, copy its `inputHash` from the demo output:

```powershell
node scripts/run-local-judge.mjs artifacts/local/judge-reference/extraction-pass.input.json sha256:YOUR_EXPECTED_INPUT_HASH
```

The runner recomputes the current source manifest and uses a strict bounded UTF-8/canonical JSON input. It makes no network request and never loads `.env.local`. The expected hash must be retained by the caller before dispatch; taking an expected hash from an untrusted response would not protect anything.

## What is implemented

- Versioned request containing request ID, local source commitment and the complete verification request.
- Input byte commitment, frozen agreement/policy/source checks, exact accepted dependency context and reuse of the authoritative deterministic rules.
- Result envelope committing to request ID, input/code hash and report envelope, with explicit limits.
- Checker replays the full reference rules as well as hashes. A substituted request or rehashed forged acceptance is rejected.
- Five regression tests, including seven conformance vectors and refusal of a consistently rehashed legacy-policy downgrade. Only deterministic profile v2 is supported. These vectors test the local wrapper against current behavior; they are **not an independent Rust/WASI port conformance result**.

The source commitment describes these repository modules and the Node runtime version. It is not an OutLayer WASM hash or proof of what remote code executed. The local runner does not keep durable nonce state; repeating the same input returns the same deterministic result. Future contract request consumption must enforce one-time settlement use.

## Independent WASI judge

The separate Rust implementation targets `wasm32-wasip2` and reads bounded JSON from stdin. Install the target for the Windows GNU Rust toolchain and obtain Wasmtime. From the project directory:

```powershell
rustup target add wasm32-wasip2 --toolchain stable-x86_64-pc-windows-gnu
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/judge-wasi.ps1 test -WasmtimePath C:/path/to/wasmtime.exe
```

The conformance runner computes the WASM SHA-256, binds it to the input, and compares decisions, individual check identities and results, and context commitments against the Node reference. Report explanations remain in the Node implementation. The runtime receives no directory or network grants. The guest compares supplied commitments. An authenticated execution service would need to prove which binary actually ran.

This implementation accepts Unicode scalar values as Rust UTF-8 strings. The corpus establishes parity for tested cases in the structured v2 fixture profile. Both runners label their output as local and expose no settlement authority.

## Remaining TEE gates

1. Pin the exact WASM hash in the remote dispatch and future contract profile.
2. With provisioned OutLayer access and budget, verify actual attestation and request/result bindings.
3. Implement and test the contract acceptance mode before enabling TEE settlement. The current settlement path uses a trusted verifier.

Official SDK reference reviewed 2026-11-09: https://app.outlayer.ai/docs/sdk

See `tee-integration-proposal.md` for the future on-chain trust boundary. Do not add a "TEE verified" badge for this reference implementation.
