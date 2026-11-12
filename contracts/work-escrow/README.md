# Work escrow — Testnet-first MVP

Implements native-NEAR, full-parent-success, full-refund and pull withdrawals. The historical designated-verifier mode remains explicit. New TEE orders use a separately frozen direct Intel TDX proof gate; the designated verifier cannot record their decisions. These guarantees apply to the reviewed code, not automatically to historical deployments.

## Current validation
Rust 1.99.1, near-sdk exactly 5.30.0, Cargo.lock checked in. Native Rust financial-core tests: 12 passed. Release Wasm compiled on Windows GNU Rust; exported methods were inspected. Native tests exercise the same state transition code used by Wasm but do not execute the SDK wrappers, runtime storage, gas or actual asynchronous receipts.

Fifteen real Sandbox scenarios passed together on official Sandbox 2.14.0 in the 12 November review, including TEE-mode bypass, context substitution, forged acceptance and missing-proof expiry/refund cases. See ../../docs/tee-escrow-stage4.md for final artifact/test evidence and limits. The fresh Testnet deployment at agentwork-tee-arlosx.testnet, initialization, code hash, owner admission and reserve are confirmed. Explicit application TEE-mode wiring and fresh funded TEE success/failure flows remain separate gates. Do not upgrade/reinitialize the historical funded escrow with this artifact.

## Build and test
From the repository root on this Windows workspace:

- npm run contract:test
- npm run contract:build (also builds the test-only actor and crypto benchmark harness)
- npm run contract:fmt

scripts/contract.ps1 uses the workspace-local GNU Rust toolchain when present, without modifying system PATH. Install Rust on a fresh machine using official rustup and add wasm32-unknown-unknown. The initial local MSVC attempt failed because Windows import/runtime libraries were incomplete; GNU Rust compiled and linked the core tests successfully.

Artifacts are in contracts/work-escrow/target/wasm32-unknown-unknown/release/. work_escrow.wasm is the contract. escrow_test_actor.wasm and tee_proof_bench.wasm are TEST-ONLY helpers; never deploy them as product components. Target directories and local toolchains are ignored by Git. TEE verification requires the NEAR P-256 host function and a speed-optimized release build; a size-optimized software-crypto build exceeded the 300 Tgas limit.

On a ready Linux/WSL x86_64 host, bash scripts/sandbox-linux.sh installs an isolated, checksum-verified Linux Node binary and runs the pinned isolated Sandbox package. It requires curl/tar/xz and network access to official Node/npm/Sandbox download endpoints. It uses the compiled Wasm from Windows; Linux Rust is not required just to execute these tests.

## Public methods and semantics

- new: private, one-time initialization by the escrow account; pre-fund the operator reserve first.
- fund_storage: non-refundable reserve donation; not escrow principal.
- set_client_admission: private operator action permitting/revoking a client for new orders only; existing funds and exits are unaffected. The contract account is always admitted. Admission uses a separate versioned storage key without changing the escrow struct layout.
- is_client_admitted: read-only admission check. Operator-funded MVP capacity is not an unrestricted public resource.
- create_work_order: exact attached allocation sum; caller becomes client; binds agreement hash, verifier, cutoff, recipients and dependency graph.
- create_tee_work_order: exact principal plus canonical agreement, freezes Testnet TEE profile, task policies and sources. No funded downgrade. Rejects deadlines outside the pinned collateral window.
- prepare_tee_request: designated work verifier supplies artifacts, not verdicts. Checks frozen inputs and actual accepted predecessors; generates evaluation time/request ID and commits exact input before execution.
- submit_tee_result: permissionless proof transport. Checks context, exact output bytes, Intel signature chain, TCB, all five pinned measurements and the signed execution commitment before recording a decision. Use 300 Tgas and zero deposit. Invalid evidence leaves the request pending; expiry/full refund remains available.
- get_tee_state: explicit mode and frozen agreement/request commitments. Never infer TEE mode from an agreement hash or UI badge.
- record_subtask_result: verifier only; final decision, report hash and artifact hash; accepted predecessors required before dependent results.
- finalize_success: permissionless; credits allocations once after all results are accepted, even after cutoff.
- mark_expired: permissionless at/after cutoff only for incomplete orders.
- withdraw_claimable: caller's own available credits; reserves a unique pending operation and returns the callback result.
- claim_refund: client only, after final failure/expiry; equivalent pending-operation safeguards.
- on_withdrawal/on_refund: private callbacks, exactly one promise result, bounded result read, matching operation required. Confirmed failure restores the reserved amount; success consumes it once. Unexpected/uncertain callback outcomes remain pending and are never blindly resent.
- get_order/get_balance/get_accounting: read-only views. Amounts and timestamps are decimal strings.

No administrator sweep, mutable recipient, funded amendment, partial payout, automatic extension, or model-chosen destination exists.

## Bounds, liquidity and accounting
MVP implementation bounds: 2–5 required tasks, at least one dependency, 64 lifetime orders, 64-byte task/order IDs, valid SDK AccountId recipients, SHA-256 digest strings, cutoff within seven days. These are conservative local MVP operating limits, not measured production capacities. There is no order deletion or archival/reclamation path yet.

Reserve envelope: 1,376,256 bytes base plus 16KiB per order, paid by operator funds; actual storage plus state overhead must fit the envelope. Every principal credit remains a liability. While transfers are pending, liquidity checks conservatively reserve the outgoing amount, even if it may already have left the on-chain balance. This can temporarily reject new writes until a callback resolves; it never uses principal to back new storage. Actual gas and reserve sizing must be verified in Sandbox.

Conservation view: funded = escrow + available_credits + pending_transfers + paid + refunded. A transfer being scheduled is not yet paid. New credits received during pending withdrawal stay available. Each recipient has at most one pending withdrawal; callbacks cannot consume it twice.

The stage-5 measured-code budget amendment passed three targeted Sandbox scenarios with a 14.25 NEAR operator balance. See ../../docs/testnet-deployment-stage5.md for the latest artifact hash, funding budget and owner-controlled deployment actions.

## Remaining financial gate
The local Sandbox suite verifies receipt ordering, failed-transfer recovery, callbacks, reserve rollback and admission revocation without trapping refunds. Secure upgrade-key custody and a fresh public Testnet smoke test remain release gates. This internal review is not an independent audit or Mainnet approval.

Runtime setup correction: build Wasm with --cfg near and target-cpu=mvp (recorded in .cargo/config.toml and the build script). Pin Sandbox 2.14.0; the 2.6.2 bundled by near-workspaces is obsolete for this SDK/compiler combination. The storage envelope includes deployed Wasm code, not only data records.

Validated runtime evidence: all ten scenarios passed together. Operator-reserve rollback uses a disclosed Sandbox-only account balance patch. Maximum-capacity storage/gas benchmarks and an independent security audit have not been performed.



