# Stable build path

Reference: specification v1.2 and approved amendments recorded in decisions.md and financial-profile.md. Preserve the nine conceptual layers, three shared systems, five algorithms and existing allocation formula. Complete one acceptance gate before declaring the next integrated milestone.

Current: recoverable local fixture workflow, immutable artifacts/reports, bounded revisions, queue leases and a prepared NEAR AI Cloud adapter. Last completed verification: 50 tests, strict TypeScript and syntax checks; two consecutive local HTTP fixture runs passed. Live AI, PostgreSQL and public Testnet settlement remain unvalidated. Rust escrow compiles, 12 native financial-core tests pass, and nine real local Sandbox scenarios now pass.

1. Economic/tooling gate: the five financial choices are now approved for the MVP. Provision and verify Rust/Cargo, contract build tooling and a supported Sandbox environment. Workspace-local GNU Rust is installed; Wasm build and native tests work. NEAR-Ubuntu and pinned Sandbox 2.14.0 are now functional.
2. Early financial slice: implement Rust escrow; prove funding → authorized verdict → success credits → withdrawal, plus rejection/expiry → client refund in Sandbox. Include asynchronous failure recovery and liability invariants before integrating application settlement.
3. PostgreSQL/storage: apply and test migrations, transactional repository, durable jobs, ownership/access control and immutable source/artifact storage. SQLite stays a development adapter.
4. Wallet/auth/agreement: signed challenge authentication, owned order APIs, immutable review/funding parity and verified chain funding. No worker runs on an unverified funding claim.
5. Master/agents: schema-valid two-task proposal, eligibility filtering and exact scoring formula, approved recipients/fees, category performance counters with real sample sizes. Do not invent agent histories or competing bids.
6. Real AI/evidence: configure NEAR AI Cloud locally, authorize a bounded live smoke run, execute two distinct worker roles, bind extracted fields to evidence and require review for ambiguity. Preserve same-agent revisions. The existing adapter has been tested only with provider doubles.
7. Integration: verifier results drive actual Testnet verdicts; downstream consumes an artifact accepted on-chain. Reconcile receipts and state, prove success/withdrawal and terminal failure/refund end to end. Deployment and credential custody must be explicitly settled before signing.
8. Evidence/UI/release: Next.js order view, downloadable evidence, deterministic offline replay, fresh setup and accurate README/demo. Label injected failures, fixtures, AI output and transfers. Benchmark and extra visual polish come after the complete core path.

Each stage: record implemented behavior, tests actually run, remaining limitations and owner-supplied resources. No paid model call, publication or public deployment follows automatically from a planning milestone.

PostgreSQL progress: migrations plus approved-order persistence and the reconciliation queue now pass eight real local database tests. Remote Supabase credentials intentionally remain blank. Full PostgreSQL workflow/report/storage and authenticated application integration are still pending; see postgres-development.md.


### Stage 1 update — 2026-11-03
The Supabase-backed loopback fixture workflow is integrated and tested (50 application + 15 local PostgreSQL tests, hosted fixture smoke). See [postgres-runtime.md](postgres-runtime.md). Runtime persistence does not grant wallet ownership, on-chain funding or final acceptance; those are later stages.


### Stage 2 update — 2026-11-03
Private Storage integration is tested locally and on Supabase (55 application + 16 PostgreSQL tests, five-object hosted smoke). Next stage: wallet ownership authentication and access control; the console remains loopback-only with a fixture identity.
