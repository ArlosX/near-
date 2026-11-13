# Prooflane

## Evaluation handoff — 11 November 2026

Project name in the repository and UI is **Prooflane / Prooflane**. This report describes the current implementation and the evidence available for review. It supersedes older planning documents for the status summarized here. Competition rankings, competitor counts and current event rules require separate research.

## 1. Product and user problem

A buyer commissions a small chain of agent work under one fixed agreement. The first worker extracts supplier terms from approved source documents. The second worker compares offers using the accepted extraction. The buyer funds payment for that work in NEAR escrow. Both required tasks must receive acceptance before the fixed worker shares become withdrawable.

The procurement budget and the worker payment are separate quantities. The demo checks whether supplier offers meet a fiat-minor-unit procurement budget. The escrow pays agents for their work. The application does not purchase the supplier's goods.

The defining product behavior is a dependency tied to accepted output bytes. Task 2 consumes the artifact hash and exact output of task 1. Accepting task 1 alone earns no partial payment. Final failure or expiry leads to full-principal refund eligibility under the contract rules.

## 2. Implementation status at a glance

| Area | Current state | Evidence or remaining gate |
| --- | --- | --- |
| Two-task dependent workflow | Implemented locally and in persisted orchestration | Extraction then comparison, revision and terminal-failure scenarios |
| Fixed agreement | Implemented | Graph, recipients, shares, policies, sources, verifier and cutoff are hash bound |
| Deterministic verification | Implemented | Structured v2 source facts, schema, arithmetic, selection and dependency checks |
| Independent Rust WASI judge | Compiled and executed locally | 25 conformance/adversarial scenarios passed against the Node reference |
| OutLayer hardware-attested execution | Pending | Owner has not provisioned access or credit |
| TEE-enforced contract acceptance | Design stage | Requires authenticated result binding and a contract acceptance mode |
| Live model execution | Adapter and runner implemented | User has not yet supplied model API credentials, live validation pending |
| NEAR escrow | Rust source and local financial tests implemented | Historical Testnet deployment and financial receipts exist |
| Latest hardened contract on Testnet | Pending owner deployment | Fresh account, admission, storage reserve and complete financial retest required |
| Dashboard | Implemented in English | Overview, Orders, Workflow, Evidence |
| PostgreSQL/private evidence | Implemented and integration-tested locally | Supabase connection and private storage are server-side configuration |
| Public production hosting | Remaining release work | Current runtime binds to loopback |
| Simplified 2–3 minute presentation | Proposed, awaiting owner acceptance | Section 10 describes the proposed sequence |

## 3. System architecture

```text
English dashboard
  -> NEP-413 wallet authentication for the PostgreSQL workspace
  -> Node.js/TypeScript service
       -> fixed agreement + versioned workflow commands
       -> PostgreSQL state, leases, attempts and audit events
       -> private evidence storage
       -> fixture worker OR explicitly invoked live model runner
       -> deterministic verifier and structured reports
       -> reviewed NEAR transaction intents
  -> owner/verifier/recipient wallet signatures
  -> NEAR Rust escrow, verdicts, allocation and pull transfers

Separate local validation tool
  canonical request -> Rust wasm32-wasip2 judge in Wasmtime
  -> decision/check results/context commitments
  -> comparison with the Node reference
```

The frontend uses HTML, CSS and JavaScript. The backend uses Node.js 24 and TypeScript. SQLite supports the reproducible fixture console. PostgreSQL/Supabase supports authenticated persistent execution. The escrow uses Rust and near-sdk. The local WASI judge is a separate Rust package.

The project has no requirement for one blockchain account or smart contract per agent. Agent identity and runtime version are agreement metadata. Money movement requires the appropriate NEAR signer.

## 4. Agreement, execution and evidence

The agreement freezes the following before funding.

- Network, contract account, order ID, client and designated verifier.
- Native NEAR principal and fixed recipient allocations summing exactly to it.
- Required task IDs, agent/runtime identities, dependency graph and revision limits.
- Acceptance criteria and each task's verification policy hash.
- Source manifest hash, result cutoff, full-parent success and full-refund policy.

Criteria and policy commitments already participate in the agreement hash. A separate redundant on-chain acceptance-criteria hash was deliberately avoided.

Execution state and financial state are separate. `CHECKS_PASSED_LOCAL` means the application checks passed. Contract acceptance, allocation and confirmed transfer each have their own evidence.

Workflow commands use expected versions and persisted idempotency results. PostgreSQL commands serialize on the order row. Worker leases and fencing prevent stale responses from committing after another worker has taken over. Provider attempts are reserved before network requests. Persisted successful responses can be reused after interruption, subject to the stored request binding.

Each report binds the order, task, agreement, policy, source manifest, artifact bytes/hash, artifact version, revision and evaluation time. Individual checks include the expected value, actual value, pass/fail and reason.

The owner-scoped evidence export includes frozen configuration, exact output bytes, worker identities, task/output versions, reports, dependency bindings and a package hash. The offline checker verifies internal consistency. Application timestamps and declared identities remain metadata. Hash consistency alone does not authenticate a source, establish hardware origin or prove payment.

## 5. What verification actually checks

New orders use deterministic policy profile v2 with a strict structured supplier-source grammar. The supported source contains explicit unit price, shipping and delivery terms. Currency and quantity are fixed by policy.

Checks cover the following.

1. Canonical artifact schema, exact task identity and expected artifact version.
2. Frozen source/policy/agreement commitments.
3. Exact extraction of supported numerical source facts.
4. Exactly one supplier entry per approved source.
5. Quotation presence in the approved source.
6. Reproducible total cost using integer arithmetic.
7. Budget, currency, quantity and delivery eligibility.
8. Consumption of every accepted predecessor hash, with no extra dependency.
9. Preservation of accepted extracted supplier facts during comparison.
10. Selection of an eligible offer, or a null selection only when none is eligible.

An offer being unsuitable is a valid business outcome. A correct “no eligible supplier” comparison can pass. An incorrect extraction, fabricated price or false “none eligible” conclusion fails its relevant checks.

The profile validates the supported fixture language. General prose interpretation, supplier authenticity and arbitrary semantic truth need additional judgment. Model instructions are one part of request construction, while deterministic validation controls acceptance in the local flow.

## 6. Judge and TEE trust boundary

The Node reference reuses the authoritative verifier. The independent Rust implementation targets `wasm32-wasip2`, accepts bounded strict JSON over stdin and runs locally through Wasmtime. It checks input/code commitments, agreement/policy/source bindings, dependencies and supported verification rules.

Its conformance runner hashes the actual local WASM artifact and compares the resulting decisions, individual check identities/booleans and context commitments against Node. Report explanation text remains in the Node implementation. The test corpus covers 25 scenarios, including altered commitments, cross-order dependencies, missing dependencies, invalid UTF-8, duplicate JSON keys, oversized input, invalid artifacts, revisions and acceptance/failure decisions. Four Rust unit tests cover strict parsing, integer boundaries and canonical serialization.

Both local modes expose attestation and settlement authority as false. The WASI output has no payment authority in the application. Running in Wasmtime establishes local execution only. The guest can compare supplied code hashes, while a remote execution service must prove which binary ran.

The proposed OutLayer integration requires pinned WASM, exact input/output commitments, request/order/task identity, frozen policy and dependency context, authenticated return handling, actual attestation validation and replay/cutoff enforcement. A future TEE acceptance mode must prevent a normal verifier signature from bypassing that requirement. This work still requires implementation and remote validation after access is available.

The current trust model uses one designated verifier. The application replays deterministic evidence before preparing new verdicts. A malicious verifier can still bypass the application and sign directly. The contract checks that signer's authority and enforces its state/economic rules.

## 7. Settlement and refund mechanics

The MVP uses native NEAR, exact deposits, fixed shares, zero platform fee and full-parent success. The operator funds storage headroom separately from escrow liabilities. Hardened source uses client admission and bounded lifetime order capacity to protect subsidized storage.

The verifier records final task results. Dependency order and the cutoff govern acceptance. All required accepted results allow success finalization, which creates recipient credits. Recipients separately claim credits through pull withdrawals. If all results were accepted before cutoff, later finalization remains possible.

Final task rejection or eligible expiry blocks success. The client then claims the full principal. Success allocation and refund are mutually exclusive. Pending transfer amounts are reserved before cross-contract calls. Private callbacks resolve actual promise outcomes and restore the reserved entitlement after confirmed transfer failure. Tests also cover new credits arriving while a withdrawal is pending.

The historical Testnet contract is `arlos.testnet`. The latest local hardened source has subsequent controls and awaits fresh deployment. Deployment preparation records the WASM/source hashes. The console and model runner now read `NEAR_CONTRACT_ID` and `NEAR_VERIFIER_ACCOUNT_ID` from local configuration. Switching deployments requires new orders and a full financial retest.

## 8. Current dashboard and demo surfaces

The English dashboard uses Ice Blue × Graphite glass surfaces, animated wave ribbons, restrained hover/entry motion and responsive layouts. Background motion can be paused and reduced-motion preferences are respected.

| Screen | Current purpose |
| --- | --- |
| Overview | Current order, local counts, next-step guidance, recent orders and protocol stages |
| Orders | Create and select orders, inspect their status and frozen configuration |
| Workflow | Task dependency state, sample scenarios, manual artifacts, revisions and financial actions |
| Evidence | Reports, per-check explanations, exact JSON, evidence export, events and transaction records |

The fixture console at `http://127.0.0.1:4317` runs without model keys or wallet access. The PostgreSQL console at `http://127.0.0.1:4318` uses wallet authentication. The `/demo` page presents historical chain evidence. Local command records and NEAR receipts have distinct meanings.

Available sample scenarios include both tasks passing, wrong output followed by repair and acceptance, final failure after the revision limit, and a valid no-eligible-supplier outcome. Sample scenarios create separate local orders.

## 9. Reproduction and recorded evidence

From the repository root, use Node.js 24+ and install dependencies with `pnpm install --frozen-lockfile`.

| Do X | See Y |
| --- | --- |
| `npm run dev:console`, then open port 4317 | Reproducible fixture dashboard |
| Open `/demo` | Historical Testnet evidence and order references |
| `npm run demo:verification` | Wrong total 999 versus expected 2100 requires revision, repaired output passes, valid no-eligible outcome passes |
| `npm run security:check` | Application tests, TypeScript and syntax checks |
| `npm run judge:demo` | Seven Node judge input/output vectors and commitments |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/judge-wasi.ps1 test` | Native judge tests and actual WASI conformance results, with local Wasmtime installed |
| Download an evidence package, then `node scripts/check-evidence-package.mjs FILE.json` | Internal evidence consistency result |
| `node scripts/demo-chain-evidence.mjs` | Read-only RPC verification of recorded chain evidence, subject to RPC availability |

Historical successful order is `demo-ae48c6ad4c64ccb1ea619980bbdae3a896a444dcba75ecf1`.

Historical refunded order is `demo-59db7f8af6913eb8350a9ba8d689cfc30c165946135dbd9d`.

Recorded withdrawal transaction is `61emgbcx2Lu4Vomy335PqATm5FK6nVt68TCdpyGTHFS4`, signed by `arlosx.testnet` against `arlos.testnet`. The read-only script checks finalized success, the withdrawal callback event and the 0.001 NEAR amount. This handoff has not freshly queried the chain.

## 10. Proposed presentation simplification

The owner requested an assessment of a shorter presentation. The following sequence is a proposal. The corresponding README/UI simplification has not yet been applied.

| Time | Show | Explain |
| --- | --- | --- |
| 0–20 seconds | Fixed agreement with two tasks and shares | A buyer commissions extraction followed by comparison under one budget and acceptance policy |
| 20–55 seconds | Task 2 locked, task 1 wrong total and report | The dependency opens only after accepted work. The checker identifies the concrete error |
| 55–90 seconds | Corrected task 1, accepted artifact binding, then task 2 | The comparison consumes the accepted extraction bytes and cannot silently replace facts |
| 90–120 seconds | Both accepted, then financial evidence | Full success allows allocation. A successful withdrawal receipt proves the transfer |
| 120–150 seconds | Separate terminal-failure or expiry example | Full-principal refund follows the failure policy. Upstream acceptance creates no partial worker entitlement |
| Optional final 20 seconds | Evidence export or WASI test summary | Exact artifacts and reproducible checks remain inspectable |

Keep dependency state, the failed check and financial outcome prominent. Move full JSON, long hashes and CLI commands into advanced evidence. Label the sample-output path, historical receipts, local WASI execution and future remote TEE work accurately. The current live signing workflow still requires manual reviewed commands.

## 11. Security and reliability work

Implemented controls include NEP-413 challenges, origin binding, session timeouts, wallet-key revalidation before authenticated writes, fail-closed RPC handling, request/rate/body limits, strict UTF-8 and duplicate-key parsing, owner-scoped persistence/evidence, private storage, bounded revision/provider attempts, lease fencing and deterministic evidence replay before verdict preparation.

Financial tests cover authority, funding, dependency order, deadlines, success/refund exclusivity, transfer callback recovery, storage headroom and accounting. These are internal engineering checks. Public multi-user hosting, independent security audit and hardware attestation require their own validation.

## 12. Validation ledger

These are the latest completed results recorded in the development session. Suites were run at different milestones. The counts should retain their suite and recency context.

| Gate | Latest recorded result | Scope |
| --- | --- | --- |
| Application | 88 passed | Latest local gate after deployment configuration changes |
| TypeScript and syntax | Passed | Same application gate |
| PostgreSQL integration | 21 passed | Previous local integration run, including owner/foreign-owner evidence access and private storage |
| Rust financial core | 12 passed | Previous contract validation milestone |
| NEAR Sandbox | 10 scenarios passed | Previous local chain milestone with real local transfers and callbacks |
| Rust judge unit tests | 4 passed | Independent judge package |
| WASI conformance/adversarial cases | 25 passed | Actual Wasmtime execution compared with Node |
| Live model | Pending | API credentials absent |
| Remote OutLayer | Pending | Access/credit absent |
| Fresh hardened Testnet deployment | Pending | Owner signature and subsequent financial retest |

## 13. Remaining work and evaluation request

The model adapter supports Gemini, NVIDIA and NEAR AI Cloud. The current PostgreSQL model workflow selects Gemini or NVIDIA to match the owner's free-service requirement. It uses one chosen provider/model configuration for both worker tasks. Multiple independently configured providers per role are future scope. No live provider compatibility or output-quality result is established yet.

After credentials are supplied, validate both dependent model tasks on a fresh order, inspect actual reports and evidence, and fix any provider/authentication/output-format issues. After owner deployment/signatures, validate fresh funding, verdicts, allocation, actual withdrawals and full refund. Remote TEE integration remains a separate development gate.

For competitive evaluation, assess the implemented dependent-work flow, explainable verification, conditional economics and reproducibility separately from the planned TEE layer. Review whether the proposed short demo makes that value visible quickly. Recommend only justified improvements within the current MVP. Any percentile/ranking claim should be supported by current competitor evidence and comparable working demos.

## 14. Repository pointers

- `README.md` and `docs/operator-runbook.md` for reproduction and operation.
- `apps/test-console/` for UI, authentication and API entry points.
- `packages/agreements/`, `packages/orchestration/` and `packages/verification/` for frozen agreements, dependencies, policies and reports.
- `packages/database/` and `supabase/` for persistence/private evidence.
- `packages/model/` and `scripts/model-run-postgres.ts` for model execution.
- `contracts/work-escrow/` for the financial contract.
- `packages/judge/`, `packages/judge-wasi/` and `scripts/test-wasi-judge.mjs` for local judge implementations and conformance.
- `docs/tee-integration-proposal.md` for the remaining remote trust-boundary design.

Some earlier milestone documents retain their historical status statements. Use this handoff alongside current source and test logs when evaluating the present build.
