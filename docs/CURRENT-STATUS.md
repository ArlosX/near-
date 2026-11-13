# Current release status — 14 November 2026

## Latest adversarial challenge

The [14 November security challenge](security-challenge-2026-11-14.md) fixed two bounded issues: contradictory model-response metadata and SQLite lease expiry at commit. Application checks (126), local PostgreSQL (22), native Rust (14), v3 Sandbox (17), WASI parity vectors (25) and fixture smoke passed. Production contract/judge code and live data were unchanged. These are local engineering checks, not an independent security certification.

## Complete live success

Current contract account: agentwork-tee-v2-arlosxq.testnet. Current code hash: 8WawYEgDE9erqwNJ2yhjJEnTobVbTm95vUbG7mkntsDx. The account name retains v2; new orders use frozen profile outlayer-tdx-direct-v3.

Order demo-521ed9a3855a27a4f33b8a6a8ceba02a223ee69bc8b2d3ec completed two fresh Gemini calls, two fresh OutLayer executions, both direct Intel-proof contract acceptances, fixed share allocation and actual withdrawal of 0.001 Testnet NEAR. Its database contains two model.response events, no model.replay.imported event, and a verified settlement.withdrawal.confirmed event. The provider responses match the exact delivered artifacts. Generation itself is operator-recorded, not TEE-attested.

Final withdrawal: 9ggfPm7tztGa5gBMD4Qqfd6UWTQTDF6nT2JrRoMREmFc. Its exact call, principal amount, matching pending/resolved operation, successful private callback and absence of failed receipts were checked.

The [public receipt manifest](../apps/test-console/public/release-evidence.json) includes the current nine-transaction path and separate refund/historical records. Public fixtures under tests/fixtures/release-v3 reproduce consistency checks without keys; fixture files do not authenticate an RPC response or replace Intel verification.

## Worker compatibility and upgrade boundary

OutLayer returned two distinct independently reviewed worker identities. V3 freezes both exact measurement digests, including all five TDX measurements. Intel signatures, UpToDate/advisory checks, judge/code/input/output/context bindings, revisions and deadlines remain mandatory. Registry approval does not dynamically expand the allowlist.

Code-only upgrade 9m1ikzhVyH6No6eqHCTqomrAMKHngZKWY3uwbZtiqtLf did not initialize storage. Both prior v2 orders and pending requests were compared before/after upgrade and remained exactly unchanged. A Sandbox upgrade test confirms the same property and subsequent v2 refund capability. No existing order was silently migrated to wider trust criteria.

## Separate refund and unfinished historical attempts

The earlier v2 order demo-1ce52318c8f490f9e774cf1f7861e79dca901eb2bf23a27a was marked expired and its full 0.001 NEAR principal refunded in 2uWdqvtXxnFNzJPC6kCbaTBkJizAfM1SKS8mKAutiY94. This predates the v3 upgrade. It is an incomplete-work expiry path, not a separately executed v3 rejection/refund.

Other failed/unfinished operator attempts are preserved in local run directories and are not labeled paid or refunded. Their frozen deadlines/refund paths remain; final cleanup may still require owner signatures. Gas and OutLayer execution charges are not included in principal refunds.

## Reproduction and wallet

The default fixture console on 4317 needs Node 24.16+ and dependencies, no .env, wallet, cloud database or provider key. The optional authenticated PostgreSQL console on 4318 uses the current escrow and owner-operated Gemini workflow. Signing/payment commands remain explicit CLI steps.

Intear Ed25519 login, logout, reconnect and refresh persistence were owner-tested with arlosxq.testnet. The original arlosx.testnet currently uses ML-DSA and cannot use this Ed25519-only login. Orders remain isolated by owner; none were reassigned.

The known exposed old arlos.testnet key was revoked in CsBoyyfftFGK1rzL1k4eV659R19JnHapfzojuEe6pggX and the retained replacement checked. This is not certification of every historical credential.

## Remaining owner gates

Owner login/workflow UI acceptance has passed; final visual preference remains owner-reviewed. Remaining deliverables are video recording, public X demo post, contact/mainnet payout details and approval of the exact submission. Source publication and final clean-copy results are recorded in the 13 November release validation report. Earlier dated reports are historical snapshots.

No production hosting, independent audit, arbitrary source truth, TEE-attested generation, independent buyer/worker custody in the single-owner demo, or competition percentile is claimed. Deployment-key authority and OutLayer governance remain trust boundaries.
