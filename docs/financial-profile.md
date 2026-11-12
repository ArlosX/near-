# Approved MVP financial profile

Date: 2026-11-02
Scope: local development, Sandbox and the Testnet-first MVP.
Authority: the owner's instruction to choose and implement the best profile after reviewing the five proposed economic decisions. This resolves the economic choices previously marked unconfirmed in v1.2 for the MVP. The original specification is preserved. It does not authorize Mainnet use, a paid service, public deployment, publication or movement of user funds.

## Chosen decisions and rationale

1. Native NEAR. Use integer yoctoNEAR strings and exact deposits. This matches the existing agreement model and avoids a token contract/registration integration for the initial demo. The procurement comparison budget remains a separate quantity in minor fiat units; escrow pays for agent work, not supplier purchasing.
2. Full-parent success. Credit fixed recipient allocations only after every required task has a final accepted result. No incremental release or partial worker pay. This preserves the complete dependent-work value proposition and the agreed failure policy.
3. Full client refund on final failure or expiry. Once failure is final, block downstream work and success finalization. Upstream acceptance alone does not earn a payment; this tradeoff must be shown before funding.
4. One designated verifier, fixed in the funded agreement. Models and workers cannot choose that account, possess its signing credential or authorize settlement. Existing deterministic checks do not prove all extracted facts. Ambiguity needs review before the verifier issues a final verdict. This is trusted off-chain verification, not decentralized verification.
5. Pull withdrawals. Finalization creates recipient credits; a recipient authorizes its own withdrawal. The UI distinguishes credit allocation, withdrawal pending and successful receipt. The client separately claims an eligible refund.

These choices are retained because switching to tokens, partial pay or multiple verifiers would expand the MVP without resolving a demonstrated requirement. Full-parent economics may be revisited for a future product; they are now explicit for this MVP.

## Required safeguards, already required by v1.2

- Freeze agreement, verifier, task IDs, recipients, allocation amounts, policy and source hashes before funding. No funded amendment, hidden recipient replacement or automatic extension.
- Allocations sum exactly to principal; platform fee is zero. Never pay storage costs from escrow principal. Maintain separately funded operator storage headroom and bounded state growth.
- Use immediate predecessor identity for authorization. Verifier writes only final verdicts; retries and content revisions remain off-chain until final.
- Result acceptance requires chain block timestamp strictly before cutoff. Fully accepted orders remain finalizable after cutoff and cannot expire/refund.
- Success credits and a refund of the same principal are mutually exclusive. Account for outstanding escrow, available credits and pending transfers without counting liabilities twice.
- Reserve an amount before asynchronous transfer. Bind a private callback to a unique pending operation and actual promise result. Permit at most one pending recipient withdrawal; preserve new credits received while a transfer is pending.
- On confirmed transfer failure, restore precisely the reserved credit/refund eligibility. Never blindly resend an uncertain transfer or label a failed callback as paid.
- Protect refunds with equivalent pending-operation/callback rules. A client refund cannot exceed the original principal.
- No administrator sweep of liabilities, arbitrary cancellation/refund, or model-selected payment destination.
- Review contract upgrade/deployment-key authority before any funding. No claim of immutability while code can be replaced.

## Demonstration scope

Two required tasks: extraction then comparison. Keep the current fixture amounts explicitly synthetic; 100 yoctoNEAR in local fixtures is not an approved real fee quote. Real Testnet demo fee, cutoff and operating/storage limits must be set after implementation and execution measurements, and shown before wallet signature.

## Acceptance gate before application settlement integration

Implement the Rust escrow and exercise exact/wrong funding, authorization, frozen allocation, duplicate verdicts, cutoff boundaries, late success finalization, failure/refund exclusivity and resource bounds. Use Sandbox to test actual asynchronous withdrawal/refund success and failure, retry, new credits while pending, callback gas and liability accounting. A TypeScript simulation or a mock promise result alone does not meet this gate.

Current status: economic profile approved; Rust escrow and its test-only actor are implemented and compiled to Wasm with near-sdk 5.30.0. Twelve native financial-core tests pass. Actual Sandbox transfers, callbacks, gas/storage bounds and Testnet settlement remain unvalidated. Workspace-local Rust is ready; WSL features were installed with owner approval but Windows reports a pending reboot. See contracts/work-escrow/README.md and sandbox-handoff.md.

Validation update: nine real Sandbox scenarios now pass, including native transfer failure recovery and insufficient-reserve transaction rollback. No public Testnet or Mainnet funding has been performed. The 512KiB operator reserve base includes deployed code.
