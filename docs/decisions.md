# Decisions and remaining work

Implemented: strict domain types with runtime guards, versioned restricted canonical JSON, graph/amount/identity/checker validation, funding mapping, bounded revision model, deterministic supplier helper checks, allocation formula and failure tests.

MVP economic profile approved by owner delegation on 2026-11-02: native NEAR, full-parent success, full client refund/no partial worker pay, one fixed verifier and pull withdrawals. See financial-profile.md for scope, tradeoffs and required safeguards. This approval does not establish a working financial contract or authorize public deployment/Mainnet use.

Development limits: 2–5 tasks, up to 3 revisions, 16 criteria/task. Exact funded-run limits remain to be confirmed.

Canonical JSON v1 sorts plain-object keys, rejects unsupported values, uses safe integer numbers, and applies no Unicode normalization. It is not a claim of RFC 8785 conformance. Add cross-language vectors before contract hashing integration.

No Rust/Cargo found in PATH or conventional cargo location. No psql/docker found in PATH. Database migration is an unexecuted draft. No chain/Sandbox security claim is established.

Supplier helpers operate on supplied structured values. Now implemented: runtime-validated worker output, frozen-policy dispatcher, immutable report envelopes and artifact/evidence binding. Next: authenticated orchestration context and transactional repository/event persistence. The current transition model is pure; future services must enforce caller authorization, transactional persistence and actual chain acceptance.

Keep existing project untouched; new root is NEAR/near-agent-work. UI is intentionally deferred. Native TypeScript execution does not imply successful static typecheck.

Local console milestone: added a plain HTML/JS development harness and a Node SQLite adapter for actual SQL transaction tests. These do not replace the planned Next.js product frontend or PostgreSQL production adapter. Local dependency acceptance is explicitly test-only. Atomic report/event/state/idempotency persistence and server-owned revision limits are implemented for this adapter; distributed jobs and chain integration remain pending.

Model connection milestone: NEAR AI Cloud adapter prepared at owner request; no paid calls authorized or performed in this step. Separate model/fixture lanes, persistent request budgets, cached completion recovery and asynchronous fenced writes are implemented for SQLite. This does not approve production verifier/economic choices, prove TEE execution, validate arbitrary-document semantic truth, or replace the planned PostgreSQL adapter. See model-integration.md.

Latest decision update: economic/verifier choices are now resolved for the Testnet-first MVP by owner authorization. Earlier milestone notes describing those same choices as unapproved are historical. Production custody, upgrades, actual funding amounts and deployment remain separate operational decisions. The next gate is the early Rust/Sandbox financial slice required by v1.2.

Rust milestone: contract implemented against pinned near-sdk 5.30.0, including dependency order and artifact/report hash fields, fixed allocations and unique pending-transfer operations. Funding intent ABI aligned, with caller-derived on-chain client identity and expected signer exposed off-chain. Native Rust tests and Wasm build pass; actual Sandbox transfer/rollback/gas validation is a blocking gate before settlement integration. Conservative implementation caps (64 orders, 2-5 tasks, seven-day maximum cutoff, bounded operator-funded storage envelope) are documented in the contract README and must be measured before a public funded demo. WSL installation was explicitly authorized; Windows needs restart before its functionality can be checked.

PostgreSQL milestone: owner requested empty Supabase placeholders and independent work. Implemented and locally validated the approved-order repository and fenced reconciliation queue on actual PostgreSQL 18.6. This does not switch the SQLite console or establish wallet authentication, remote RLS ownership access, object storage, real funding or live model execution. See postgres-development.md.
