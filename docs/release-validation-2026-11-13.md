# Release validation — 13 November 2026

## Current completed live path

Order: demo-521ed9a3855a27a4f33b8a6a8ceba02a223ee69bc8b2d3ec. Agreement: sha256:ffd010bde440462c50f75a04c7ebb88330ef886cb461d2d52f14a9d94d32e551.

Contract: agentwork-tee-v2-arlosxq.testnet. Account name is historical; new orders use outlayer-tdx-direct-v3. Code SHA-256: 6f9607448a279d853e3ad95e8f59b4760ccd8110bde27bc9832d94ae9789e09f. NEAR code hash: 8WawYEgDE9erqwNJ2yhjJEnTobVbTm95vUbG7mkntsDx.

Two fresh Gemini model responses were recorded and matched to the delivered artifact bytes. No model.replay.imported event exists in this order. Gemini generation is operator-recorded; deterministic verification, not generation, is attested by TEE. Comparison ran through the chain-dependent model guard only after extraction acceptance.

| Step | Final Testnet transaction |
| --- | --- |
| Fund | H1TaUkfdTG7UabPiNYft7nyGhLVeSWq8MCs9sosbmiS4 |
| Prepare extraction | Bf9yW8z5EGFHKdrFPoaPipZx8YXTmz9akpJtGCWYxCaC |
| Execute extraction | F2od1YbwXJxsRqmu7XZXwpBpN9jsYaHycVrAWhoBe1GY |
| Accept extraction | 7E5zcVnARw1URRebRTfC5Y7jTzgmxYhYZr67i26xSgi5 |
| Prepare comparison | 7f97jMq5HsjikZf9UNan9c8DrqMcTGXe8J2M1CJ4G68K |
| Execute comparison | 7ZCrYrhbw4o7D2mZZCK5hJFQ6dub3vKzPeADgYDXGQQ5 |
| Accept comparison | CeLLRvsn1d7ykHKqajkqYGJxb9tVxeHhFZugMM976AQR |
| Allocate | C8KfnjTSa3utX1i3HAqJgTgJf5AWT1mQtmNpNGpiLY7L |
| Withdraw | 9ggfPm7tztGa5gBMD4Qqfd6UWTQTDF6nT2JrRoMREmFc |

The final 0.001 NEAR withdrawal matched the exact recipient, method/arguments, amount and operation 6; its private callback succeeded and no receipt failed. Final contract state confirms every task accepted and SuccessCredited. The database was reconciled with the verified withdrawal event. Credits allocated and money paid remain distinct states.

## Worker compatibility correction

OutLayer produced both previously reviewed full measurement identities. A new singleton pin did not guarantee routing, so paid retries were stopped. V3 freezes the two-entry allowlist before new work begins. All five TDX measurements remain covered, along with Intel signature/collateral/TCB checks and exact judge/input/output/request bindings. Unknown identities do not automatically inherit trust from registry approval.

Code-only upgrade 9m1ikzhVyH6No6eqHCTqomrAMKHngZKWY3uwbZtiqtLf used no initializer. Both older v2 order states and pending requests exactly matched the pre-upgrade snapshot. Existing profiles are selected from their stored Frozen.profile; they do not silently acquire the v3 allowlist.

## Validation

- 117 application/security tests passed; strict TypeScript and configured syntax checks passed.
- Six production-helper crypto conformance cases passed: both genuine identities accepted under v3; cross-profile historical misuse, changed quote signature and changed output rejected.
- Five targeted Sandbox scenarios passed on the exact v3 artifact: real financial payout, frozen profile enforcement, forged context rejection, full expiry refund, and preservation/refund of a funded pending v2 order across the code upgrade.
- The earlier v2 financial suite covered 16 cases (15 full-run passes and a targeted pass after replacing the old-worker fixture in the context test). Native state tests previously passed 12 cases; they are not newly counted as v3 cryptographic tests.
- The public live-run fixtures reproduce deterministic checks, model/artifact consistency, dependency hashes, TEE summary/context consistency and the derived withdrawal callback receipt without credentials. This fixture replay is not offline authentication of the RPC or Intel chain; the official verifier and live escrow supplied those checks separately.
- Current demo guide and all four fixture routes were checked in-browser. Mobile guide at width 390 had document width 380, with no horizontal overflow. Existing layout, theme and interactions remain.

Default build is v1. Reproduce the current artifact with --features tee-worker-v3 and the repository wasm target flags. Run Sandbox 2.14 with BOTH NEAR_SANDBOX_BIN_PATH and NEAR_SANDBOX_BINARY_PATH set to its absolute directory. The initial runtime-path errors are retained as diagnostics and not counted as passing tests.

Final clean-copy install with pnpm --frozen-lockfile passed. The no-key/no-cloud smoke completed both tasks, served seven assets and exported evidence; all 117 tests, strict TypeScript and syntax checks passed again in that isolated copy. All nine public live-run receipt links were re-read and matched against exact expected methods, arguments, deposits and final successful outcomes. Source-publication receipt is retained in the local release logs. No claim of hosted production service, independent audit, arbitrary source truth or independent buyer/worker custody is made.

## Separate refund and owner gates

A separate earlier v2 expiry/refund on the same account completed in 2uWdqvtXxnFNzJPC6kCbaTBkJizAfM1SKS8mKAutiY94. No separately executed v3 rejected-output refund is claimed. Other unfinished historical runs remain eligible only under their original deadlines and require cleanup separately; they are not silently marked refunded.

Remaining owner deliverables: short authenticated UI acceptance, final 2–3 minute video, public X post, final personal/mainnet payout details and approval of the exact submission.
