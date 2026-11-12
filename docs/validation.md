# Foundation validation

> Historical foundation results. See finalization-2026-11-09.md for the latest independently rerun application, PostgreSQL, Rust and Sandbox gates. Statements below about unexecuted milestones refer to the original foundation stage.

- node --test --test-isolation=none tests/domain.test.mjs: 9 passed, 0 failed.
- node node_modules/typescript/bin/tsc --noEmit: passed with TypeScript 5.9.3 / Node 24 typings.
- node --check on four domain modules: passed.
- node scripts/demo-checks.ts: fixture with incorrect arithmetic rejected, manually corrected fixture eligible. No AI or chain activity.

Dependency setup: initial network timeouts and TypeScript 7 Windows executable failure were resolved by pinning portable TypeScript 5.9.3 and @types/node 24.19.2. pnpm lockfile saved.

Not executed: PostgreSQL migration, Rust/contract/Sandbox tests, browser tests, real worker/model and chain integration.

- npm.cmd run typecheck: passed.
- pnpm.cmd run typecheck: environment-specific dependency auto-reinstall attempted and failed with NO_TTY; use the verified npm commands. Compiler execution itself passed.

## Policy-bound verification milestone

- npm.cmd test: 22 passed, 0 failed.
- npm.cmd run typecheck: passed.
- npm.cmd run check:syntax: passed.
- npm.cmd run demo:verification: generated three labeled fixture reports; bad arithmetic requires revision, corrected version passes deterministic checks, valid no-eligible conclusion passes.
- 0002 migration is an unexecuted SQL draft; no database/chain/model verification claimed.

## Local UI and transaction milestone

- npm.cmd test: 33 passed, 0 failed.
- npm.cmd run typecheck and check:syntax: passed.
- Actual SQLite integration tests: commit, injected rollback, idempotency/retry, revision exhaustion, stale versions, persistence/immutability and HTTP safeguards passed.
- Browser: success, repair, final failure, no eligible supplier, manual bad arithmetic, replay, rollback and reload after server restart verified.
- No AI or NEAR transaction tested; PostgreSQL migrations remain unexecuted.
- See docs/test-console.md and artifacts/local/test-console.png.

## Durable fixture worker
37 automated tests pass, including reconnect recovery, lease fencing across two database connections, no duplicate report after a committed submission, expired-order handling and explicit retry after a transient failure. Strict TypeScript and syntax checks pass.

Live HTTP background smoke test passed: order demo-06e29c2a-60f3-4ba7-b123-de5393d8cf99 finished CHECKS_PASSED_LOCAL, job DONE in one attempt, two persisted reports. No AI or blockchain transaction was involved.

## Model connection milestone
50 tests pass, with 12 model-path tests and a multi-order fixture regression: separate runner lanes, persisted prompt/response without API key, arithmetic repair, bounded malformed-output revisions, persistent transport budgets, cached-response recovery, stale lease rejection, targeted order execution, response/timeout limits, actual local HTTP exchange, and expiry during inference. All provider responses are scripted test doubles; no live NEAR AI Cloud inference or attestation was validated. Strict TypeScript and syntax checks pass.

Final live local check: two consecutive HTTP background fixture runs passed against the existing console database (orders demo-cee897e7-c4c7-463a-9032-d92ab96fdf9a and demo-57e9a2a7-0e02-4f28-9bf7-6e1ccd9c371f), each DONE with two reports. This exposed and fixed cross-order event-key collisions by namespacing new event keys with order ID; prior immutable records were retained. Configuration-only CLI smoke check used dummy credentials and reported networkCalls: 0.

## Rust escrow milestone — 2026-11-02
Implemented the shared Rust state machine and Wasm contract wrapper, private bounded transfer callbacks, principal-conservation counters, storage/liquidity envelope and fixed dependency/recipient allocations. near-sdk exactly 5.30.0 and Cargo locks retained. Windows GNU Rust 1.99.1 built both release Wasm files. Twelve native Rust financial-core tests pass; SDK wrappers/real receipts are NOT covered by these native tests. Fifty application tests, strict TypeScript, syntax checks and Rust formatting pass after fundingIntent ABI alignment. The seven real Sandbox scenarios are prepared and JavaScript syntax-checked, NOT executed. Bash setup syntax was checked with Git Bash. WSL installer features completed and the elevated installer returned 0, but WSL still reports WSL_E_WSL_OPTIONAL_COMPONENT_REQUIRED and the registry reports RebootPending. No public account/deployment, Testnet transfer, model call or signer was used.

Real Sandbox attempt: 0/7 with bundled old runtime; corrected runtime pin, deployed-code storage budget and NEAR host compilation flag. Updated Wasm build passed. Final validation remains blocked by an unresponsive WSL service; no Sandbox success claim is established.

## Financial Sandbox milestone achieved
Pinned official Sandbox 2.14.0 on NEAR-Ubuntu; rebuilt with --cfg near and target-cpu=mvp; operator storage base includes deployed code (512KiB). Original seven scenarios passed in one run (273506 ms), then malformed graphs passed in a targeted run, and corrected storage rollback fixture passed in another targeted run. All nine scenarios have passed, not a single combined nine-test invocation. Storage underfunding is a disclosed Sandbox account-balance patch after initialization, preserving code/storage metadata and zero-liability state. Tested actual success/withdrawal, failure/refund, expiry, private callbacks, pending-credit preservation, native transfer failure and retry. Twelve Rust tests, formatting and TypeScript rechecked successfully. No public Testnet deployment or real funds used.

## Local PostgreSQL milestone
PostgreSQL 18.6 installed inside NEAR-Ubuntu. All eight integration tests passed on actual PostgreSQL: three migrations, atomic approved graph, rollback fault injection, concurrent idempotency, SQL snapshot/allocation/dependency immutability, RLS deny-by-default, unique job claim, lease recovery/fencing and expired-completion rollback with persistent attempt cap. Tests use only the dedicated local near_agent_dev database and generated schemas. No Supabase connection or migration was attempted. Fifty application tests and strict TypeScript/syntax rechecked successfully.
`nSupabase connection verified on 2026-11-03 using owner-supplied Supabase Root 2021 CA and strict certificate/hostname validation. PostgreSQL 17.11 responded inside BEGIN READ ONLY; public.work_orders was absent. No migrations or writes were applied. DATABASE_CA_PATH now points to the ignored local certificate file; credentials were not printed.

## 2026-11-03 full available regression after Supabase setup
- Supabase PostgreSQL 17.11: strict CA-verified TLS and read-only inspection passed; all nine expected near_agent_work tables present, all nine RLS enabled, ten enabled application guard triggers, anon/authenticated schema USAGE denied. No remote writes performed by this check.
- Application tests: 50/50 passed. TypeScript, syntax, Rust formatting checks exited 0.
- Rust financial core: 12/12 passed; doc-tests 0, exit 0.
- Local PostgreSQL 18 integration: 8/8 passed (24507 ms), isolated local schemas.
- NEAR Sandbox: full combined run 9/9 passed (381756 ms), including native transfer success/failure, refunds, cutoff, storage rollback and malformed allocation graph rejection. Detailed evidence: artifacts/local/sandbox-latest.log.
- Limits: no live NEAR AI inference, public Testnet deployment, or end-to-end production backend/Supabase execution was validated. Supabase inspection verifies deployed structure, not the local PostgreSQL behavior suite against the hosted database.


## 2026-11-03 stage 1 PostgreSQL execution runtime
- Application regression: 50/50 passed. Strict TypeScript and syntax checks passed.
- Local PostgreSQL integration: 15/15 passed, duration 12112.9 ms, final migration 0004 included. Covers immutable runtime config, RLS, atomic creation/submission rollback, full two-task workflow, revision exhaustion, optimistic concurrency, expiry, worker crash recovery and HTTP routes.
- A cold-boot rerun initially failed with PostgreSQL 57P03 (server starting up); test-postgres-local.sh now waits for readiness. Final run passed.
- Supabase additive migration 0004 applied successfully: 10 tables, RLS on all 10, 12 application guard triggers, anon/authenticated schema usage denied, CA-verified TLS.
- Real Supabase fixture probe passed: demo-smoke-2dd4f828-e331-48bd-a698-501dd9ce7a05; two hash-bound reports, replay without duplicates, rollback, closed/reopened pool and queued dependent completion. Financial status remains APPROVED. No AI or blockchain calls.
- Loopback PostgreSQL console launched on port 4318. No existing SQLite data migrated; fixtures retained for inspection.
- Stage 2 object storage, wallet auth, funded chain reconciliation, live-model PostgreSQL runner and settlement remain separate future stages.


## 2026-11-03 stage 2 private Storage integration
- Application regression 55/55 passed; strict TypeScript and syntax passed. Five storage tests cover exact Persian UTF-8 bytes, retry/no overwrite, tamper and missing-object detection, upload failure, public-bucket rejection, byte limit, traversal and invalid configuration.
- Local PostgreSQL 16/16 passed (34013.9 ms), including additive migration 0005 and private evidence metadata rollback after injected storage failure. SQL artifacts use null inline bytes when archived.
- Official @supabase/storage-js 2.118.0 added and pinned. Project-specific near-work-evidence bucket created via API, private, 1 MB limit. Server credential never printed.
- Supabase migration 0005 applied successfully. Read-only check confirms all 11 tables have RLS, 13 enabled application guard triggers and denied anon/authenticated schema USAGE, with verified TLS.
- Hosted smoke passed: demo-smoke-7738633c-472c-4614-810a-8c58396e8c70; five private objects (canonical sources, two artifacts, two canonical report envelopes); actual upload/download/hash verification and anonymous public-download denial passed. Two reports, reconnect, idempotency and rollback passed; financial status remains APPROVED.
- Worker renews only still-valid leases after each committed step, up to 60 seconds; expired-token checks remain in place.
- SQL rollback does not roll back remote object uploads. Unreferenced private objects may remain after a failed command; no automatic deletion is attempted. No chain transaction or live model call was made. See private-evidence.md.
