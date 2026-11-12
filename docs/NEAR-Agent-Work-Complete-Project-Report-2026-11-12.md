# NEAR Agent Work — Complete Project and Architecture Report

> Historical same-day snapshot: the new-profile complete TEE payout and expiry/refund have since been verified. See [CURRENT-STATUS.md](CURRENT-STATUS.md) and the public receipt manifest for the latest checkpoint.

**Product:** Verifiable Agent Work & Settlement Protocol  
**Report date:** 12 November 2026  
**Purpose:** A self-contained technical and product handoff for the project owner, hackathon evaluator and implementation agent.  
**Evidence boundary:** This report consolidates the local implementation, recorded tests and verified receipts through the latest extraction-acceptance transaction. It does not claim a fresh blockchain inspection at the time someone later reads it. Earlier planning documents can contain superseded milestone statements; the dated evidence and distinctions below take precedence for this snapshot.

## 1. Executive summary

NEAR Agent Work makes payment conditional on the successful completion of a dependent workflow, rather than merely limiting what an AI agent may spend.

A buyer approves a fixed agreement containing the task graph, verification policies, source commitments, deadline, recipients and allocations. The buyer funds a NEAR escrow. A first worker extracts supplier facts. A second worker can execute only after the first output is accepted, and must consume that exact accepted output. A deterministic judge checks the deliveries. In the new TEE profile, the escrow verifies an Intel TDX execution proof directly before recording acceptance. Only complete parent-workflow success permits worker-share allocation. Eligible final failure or expiry permits refund of the full principal.

The project has working domain logic, PostgreSQL persistence, private evidence storage, an English dashboard, model adapters, a Rust escrow, a Rust WASI judge, actual OutLayer executions and direct on-chain TEE acceptance for the first task of a newly funded order. The complete new two-task TEE success path through actual withdrawal remains unfinished. The new-profile failure/refund path also remains a release gate.

The strongest defensible positioning is: **dependent agent work, frozen acceptance rules, evidence-bound verification and all-or-nothing worker entitlement.** No ranking percentile or superiority over particular competitors is established by this report.

## 2. Problem, user and core value

The initial user is a buyer or operator commissioning a small chain of agent tasks. The user needs to know that downstream work used the accepted upstream result, that acceptance rules did not change after funding, and that an incomplete workflow did not earn a partial payment.

Common failure modes include fabricated facts, incorrect totals, omitted offers, selection of an ineligible supplier, downstream use of a different upstream artifact, mutable acceptance criteria, ambiguous execution retries and payment after only part of the work succeeded.

The protocol connects the work graph to the financial outcome. It records what was agreed, which exact bytes were checked, what passed or failed, and whether the financial state is merely funded, allocated, pending transfer or actually paid.

### Difference from a spending firewall

| Spending-control question | Agent Work question |
| --- | --- |
| May this agent pay this destination? | Did every required task satisfy the frozen agreement? |
| Is this transaction below a spending limit? | Did downstream work consume the accepted predecessor bytes? |
| Does this call match an allowlist? | Is there a valid, context-bound verification result? |
| Should this outgoing payment be blocked? | Has the whole workflow earned the fixed allocations? |

Spending controls may complement the protocol. They do not replace work acceptance or dependency verification.

## 3. Deliberately narrow MVP use case

The implemented example is supplier procurement with two required tasks:

1. **Extract & cite:** Read two supported source documents and produce structured supplier facts with exact source quotes.
2. **Compare & select:** Preserve the accepted supplier facts, calculate eligibility against the frozen constraints and select an eligible supplier, or return no selection if none qualifies.

The current source documents are synthetic structured fixtures. This is a real execution demonstration over synthetic business inputs, not a production procurement feed or live web-research engine.

The example uses quantity 2, USD minor units, a 2,500-cent procurement constraint and a maximum delivery time of seven days. Supplier A has unit price 1,000 cents, shipping 100 cents and delivery in three days, producing total 2,100 cents. Supplier B has unit price 1,300 cents, no shipping charge and unknown delivery, producing total 2,600 cents. Unknown delivery does not prove eligibility.

**The procurement constraint and the agent escrow fee are different amounts.** The funded demonstration's escrow principal is 0.001 Testnet NEAR. It is not the USD purchase budget, and the MVP does not actually purchase supplier goods.

## 4. Actors and authority

| Actor/component | Responsibility | Authority it does not receive |
| --- | --- | --- |
| Buyer | Approves the fixed agreement, funds the order and claims eligible refund | Cannot silently rewrite the funded agreement |
| Extraction worker | Produces the first versioned artifact | Cannot authorize acceptance or move escrow funds |
| Comparison worker | Uses the exact accepted predecessor and produces a comparison | Cannot replace upstream facts or choose payment recipients |
| Orchestration service | Coordinates state, evidence, model reservations and unsigned transaction preparation | Local success does not equal contract acceptance |
| Deterministic judge | Evaluates the supported policy against bound inputs | Does not establish arbitrary real-world truth |
| OutLayer worker | Executes the pinned WASI judge and produces attestation evidence | Platform verdict flags alone do not authorize escrow acceptance |
| Escrow contract | Enforces the frozen profile, acceptance, allocations and transfer/refund state | Does not run a general language model or retrieve private evidence |
| Owner/operator | Manages deployment, admission and operational signing | Deployment-key authority remains a disclosed trust boundary |

The current fresh demonstration uses `arlosx.testnet` as buyer, verifier/request preparer and recipient of both worker shares. This tests the protocol path, not independent worker custody or independent verifier governance. Agent IDs are application identities; each worker does not require a separate contract or blockchain account.

## 5. Architecture and component boundaries

```text
English dashboard / owner CLI
          |
Wallet-authenticated Node.js application
          |
Agreement + orchestration + deterministic verification
          |                         |
PostgreSQL + private evidence       Model adapter -> Gemini / NVIDIA
          |
Unsigned, owner-reviewed NEAR transaction intents
          |
NEAR escrow: frozen agreement and TEE request commitments
          |
OutLayer Testnet -> pinned Rust WASI judge -> Intel TDX quote
          |
Independent proof verification + exact receipt/input/output binding
          |
Escrow submit_tee_result: direct Intel proof verification
          |
All required tasks accepted -> allocate shares -> recipient withdrawal
Final failure / eligible expiry -> full-principal refund claim
```

### Implemented stack

| Layer | Technology and role |
| --- | --- |
| Frontend | Plain HTML, CSS and JavaScript; four dashboard screens |
| Application | Node.js 24+, TypeScript, explicit bounded adapters |
| Local demo | SQLite-backed fixture runtime, port 4317 |
| Authenticated workspace | PostgreSQL/Supabase-backed runtime, port 4318 |
| Evidence archive | Private Supabase Storage bucket with immutable hash-bound objects |
| Contract | Rust, near-sdk 5.30.0, NEAR Testnet |
| Judge | Rust WASI component, `wasm32-wasip2`; local Wasmtime and OutLayer |
| Attestation verification | Intel TDX/DCAP; dcap-qvl 0.5.2 and supported NEAR cryptographic host operations |
| Transactions | Official NEAR CLI with owner-reviewed keychain signing |
| Local chain validation | NEAR Sandbox inside WSL/Linux |

The existing stack is preserved. A frontend framework migration, additional blockchain or general agent marketplace is not required for this MVP.

## 6. Frozen agreement and cryptographic commitments

The agreement schema is version `1.2`. It includes network, escrow contract, order ID, buyer, verifier, NEAR principal, result cutoff, source-manifest hash, settlement/failure rules and required tasks.

Each task contains its ID, application agent ID, runtime version, fixed recipient, fixed allocation, dependency IDs, maximum revisions, registered criterion IDs/checker versions and verification-policy hash.

The agreement hash commits to the whole task graph and the per-task policy hashes. Policies commit to their actual constraints and checks. A separate redundant on-chain criteria-hash field was not added: the existing commitment chain already freezes those rules.

Hashing uses the project's canonical JSON representation with sorted object keys and safe integer numbers. Monetary atomic/minor-unit values use validated decimal strings and integer arithmetic. This is a project-defined canonicalization protocol, not a claim of certification to an unrelated canonical-JSON standard. Artifact hashes bind exact UTF-8 bytes.

Important commitments include agreement, policy, source manifest, artifact, dependency-artifact, report, evidence-package, judge code and TEE input/output hashes. Hash consistency alone does not prove authorship, attestation or payment.

## 7. Execution, dependencies and revisions

An order starts from an approved snapshot. Local checks create versioned artifacts and reports, while financially authoritative results are reconciled from finalized chain state.

For TEE orders, the application checks the on-chain order and frozen TEE metadata at the same finalized block. Before a dependent worker starts, every required predecessor must be accepted on-chain with the exact locally archived artifact hash. A local accepted label cannot unlock task 2.

The model runner executes one deliverable at a time in TEE mode, then stops for contract preparation and TEE acceptance. It does not automatically run comparison immediately after a local extraction pass. Original provider output and its normalized artifact are bound through durable model-response events.

Invalid output may require revision while the frozen revision budget remains. At the final allowed failed revision, the task is rejected and dependent work stops. In TEE mode, on-chain revision state must advance before a retry; a local revision counter cannot authorize another chain attempt by itself.

Model-call reservations are committed before contacting the provider. An ambiguous timeout does not silently cause another billed request. An explicit recovery path permits one additional durably recorded attempt for an unanswered reservation. It retains the original reservation and records that the original provider completion is unknown. This is not a guarantee that the provider did no work after a timeout.

## 8. Verification: exactly what is checked

The supported deterministic profile checks:

- Artifact schema, task/version identity, allowed fields and data types.
- Source coverage without silent omission or duplicate source use.
- Exact quotes and supported structured source facts, including price, shipping and delivery.
- Approved currency and quantity.
- Integer arithmetic: unit price × quantity + shipping.
- Budget and delivery eligibility.
- Comparison preserving the accepted predecessor facts.
- Exact predecessor artifact hash bindings without missing or extra dependencies.
- Eligible supplier selection, or a valid no-eligible-offer result.

Each rich local report contains decision, criterion/checker identities and versions, expected value, actual value, reason, artifact version/revision, evaluation metadata and all relevant commitment hashes. Decisions are `accepted`, `revision_required` or `rejected`.

The WASI judge returns a smaller verification summary for the attested protocol. The on-chain report hash covers that summary, not the larger local report envelope. The adapter explicitly handles this distinction.

These checks establish compliance with a narrow frozen policy and supported source grammar. They do not prove that arbitrary documents are truthful, that a supplier will deliver, or that unrestricted prose has been semantically understood correctly. Unsupported source formats fail closed rather than being silently treated as verified.

## 9. TEE profile and direct contract enforcement

The new immutable verification mode is **`outlayer-tdx-direct-v1`**. The historical designated-verifier mode remains separate. A TEE-funded order cannot be downgraded to the old `record_subtask_result` authorization path.

### Pinned execution identity

| Commitment | Value |
| --- | --- |
| Judge WASM SHA-256 | `bb9fa85b135deb155f187f9ea49df8c907f90b885a88b90459f5bed208122051` |
| Published artifact commit | `a25b1940d6560ac86daae4c8eceb874133ba7844` |
| Collateral raw-byte SHA-256 | `2e80992e78a9e76e5726db22b7399c553439574e6fe512a3b311ae4c3d559140` |
| Combined pinned worker-measurements digest | `5fccdb6924dbbe7ab09a4ca412e1b264196e44c47c795774326da89a376e45c3` |
| Profile cutoff bound | Before `1796688919000000000` ns, 8 December 2026 00:15:19 UTC |

Immutable artifact URL: [published judge.wasm](https://raw.githubusercontent.com/ArlosX/near-/a25b1940d6560ac86daae4c8eceb874133ba7844/judge.wasm).

### Protocol sequence

1. `create_tee_work_order` funds the order and freezes the canonical agreement under this profile.
2. `prepare_tee_request` checks agreement/policy/source/dependency/revision bindings. The contract generates a request ID and evaluation timestamp, then commits the exact judge-input hashes.
3. `request_execution` on `outlayer.testnet` executes the pinned `WasmUrl` component. Current resource limits are one billion instructions, 128 MiB memory and 30 seconds; response format is Text.
4. The adapter obtains the exact final transaction and Intel quote/collateral bundle. Independent verification checks the Intel chain, worker approval and execution commitments. Receipt checks bind caller, target, arguments and exact returned bytes.
5. `submit_tee_result` verifies Intel proof and frozen context inside the escrow before consuming the pending request and recording the outcome.

The contract checks direct proof validity, pinned worker measurements, judge code, request/input/output bindings, artifact/policy/agreement/source identity, revision and time constraints. Bundle booleans and an operator's `accepted` assertion are not sufficient authority. Proof transport is permissionless, but it must carry a proof bound to the authorized prepared execution.

Text output is a JSON-encoded string containing the guest output. Its exact returned bytes are hashed; trimming or hashing a different parsed serialization would break the commitment. Local guest fields such as `attested: false` are not relabeled to true: the outer hardware quote establishes execution origin.

### Trust limits

TEE authenticates execution under a hardware/software trust profile; it does not make the model or source data truthful. The profile depends on Intel/DCAP, collateral validity, the pinned runtime measurements and the judge implementation. Runtime pins do not automatically follow later registry revocations or approve future runtime upgrades. Expiry or a different runtime requires a reviewed profile/deployment decision. The escrow deployment keys can replace code, so the deployed system is not presented as unconditionally immutable.

## 10. Escrow, allocation, withdrawal and refund

The current funded order principal is `1000000000000000000000` yoctoNEAR, or **0.001 Testnet NEAR**. Extraction receives a fixed 40% allocation and comparison 60% only after complete success. Acceptance of extraction alone earns no partial allocation.

Financial stages remain distinct:

1. **Funded:** principal is held by escrow.
2. **Results accepted:** individual task verdicts are recorded; payment is not implied.
3. **Success credited:** `finalize_success` creates fixed recipient credits after all required results are accepted.
4. **Withdrawal pending:** a recipient initiates a separate transfer.
5. **Paid:** transfer success is confirmed through the restricted callback/accounting path.

For eligible final failure or expiry, the buyer claims the full principal. Refund does not include spent transaction gas or separate OutLayer execution fees. After cutoff, incomplete orders can be marked expired; fully accepted orders follow their finalization rules rather than being incorrectly expired. Transfers/refunds use pending-operation tracking and private callbacks. Failure restores the appropriate credit/refund eligibility. Duplicate transfer, double payment and success/refund overlap are guarded.

The contract maintains escrow, available credits, pending transfers, paid and refunded amounts and storage/operating reserves. It has operator-managed client admission and 64 lifetime order slots to bound subsidized state growth. Completed slots are not assumed to become reusable. The deployment was provisioned and tested for two demonstration orders; it does not imply funding for all 64 slots.

## 11. Persistence, evidence and authenticated API

Supabase PostgreSQL uses migrations 0001–0005 for agreements, tasks, policies, deliverables, reports, immutable execution configurations, events, command results, job leases and archive references.

State changes use transactions, owner scoping, per-order serialization, optimistic versions and idempotency fingerprints. Reusing a request key with different payload is rejected. SQL immutability protections reduce accidental/application-level mutation but do not eliminate database-owner authority.

Private Storage objects bind storage key, content hash and byte count. Reads use strict UTF-8 decoding and verify hashes. Configured private evidence is not silently skipped when references or objects are missing. Evidence exports contain the frozen agreement, source/policy data, versioned artifact bytes, reports, identities and hashes. Their offline checker demonstrates internal consistency; it explicitly does not establish hardware origin, authentic time or payment.

Recent command-line reconciliation reuses verified immutable bytes only within one command and retries unavailable archive downloads a bounded number of times. This reduces repeated downloads without disabling integrity checks. Supabase returned intermittent 429/500 errors, including `too_many_connections`; provider availability remains an operational dependency.

The authenticated workspace uses wallet-signature login, owner-scoped access and finalized-chain key revalidation before authenticated writes. Connecting a wallet is authentication, not a payment. Current transaction preparation/signing remains a separate owner-reviewed CLI process.

## 12. Model integrations and cost policy

Adapters exist for Gemini, NVIDIA and NEAR AI Cloud. Fixed HTTPS endpoints, bounded time/token/response sizes, strict JSON/UTF-8 parsing, completion checks and disabled model tool calls limit the adapter boundary. Providers do not receive escrow keys or authority to choose payment destinations.

The current funded TEE test explicitly uses the separately configured Gemini model **`gemini-3.5-flash-lite`**. The existing NVIDIA configuration is **`meta/llama-3.2-90b-vision-instruct`**. These identify the current local configuration, not a promise that each provider will indefinitely expose a free endpoint. There is no silent provider/model substitution.

The owner prefers free inference access. Free model access does not make every dependency cost-free: Testnet gas, operator storage reserves and OutLayer execution deposits still exist. The on-chain Testnet OutLayer route has worked without provisioning a Payment Key. No funded mainnet operation is claimed.

Source text, dependency content and feedback are treated as untrusted data in model instructions. Deterministic checks and the contract are the acceptance boundary; prompt wording alone is not treated as a security guarantee.

## 13. Frontend and demo experience

The frontend is English, with an Ice Blue × Graphite visual identity, dark translucent glass surfaces, no unnecessary card outlines, a code-driven moving ribbon background and restrained interaction motion. Reduced-motion behavior and a background pause control exist.

Four screens are implemented:

| Screen | Purpose |
| --- | --- |
| Overview | Current workflow context, loaded-order statistics, next action and protocol explanation |
| Orders | Order selection/filtering and staged order creation |
| Workflow | Two dependent tasks, their versions/revisions, next action, local scenarios and financial actions |
| Evidence | Individual checks/reasons, hashes, versioned outputs, event history and evidence downloads |

Manual output editing, detailed agreement data, raw JSON and test utilities are secondary/advanced controls. Scenario buttons use predefined outputs and create separate sample orders. They do not prove live AI execution or move funds automatically. Draft persistence was manually tested during development, but this does not replace the final full UI acceptance pass.

The general dashboard and historical financial demo are functional. The current new TEE release path is being exercised through dedicated owner CLI scripts. Seamless final UI integration for that path, its errors and final withdrawal reconciliation remains unfinished; the report does not present it as a completed one-click experience.

## 14. Security work and actual testing scope

Implemented controls include strict runtime validation, duplicate-key/depth rejection, fatal UTF-8 decoding, owner-scoped APIs, same-origin/loopback restrictions, bounded requests and responses, login/rate/session limits, wallet-key revocation checks, immutable evidence bindings and deterministic replay before financial preparation.

Financial controls include fixed agreement/recipients, exact funding checks, on-chain dependency and cutoff enforcement, no legacy-verdict bypass for TEE orders, pending-transfer protection, callback restrictions, accounting conservation and storage/admission bounds.

Attack patterns reviewed include source/prompt injection, fabricated outputs, ambiguous provider envelopes, malformed encoding, dependency swaps, forged local accepted reports, cross-owner access, revoked keys, replay, duplicate verdicts, altered proof bytes and callback/transfer failure paths.

Security references included OWASP ASVS/GenAI guidance and patterns from NVIDIA garak and Microsoft PyRIT. **The garak and PyRIT toolkits themselves were not run.** Adapted regression probes used synthetic sources and provider test doubles. No independent professional audit, ASVS certification or broad live-model penetration-test coverage is claimed.

Private keys previously exposed in historical development must be treated as compromised. Revocation/rotation must be independently checked before any reuse; application hardening cannot compensate for a leaked full-access key. This report contains no private keys or API credentials.

The application currently targets a loopback development environment. Public multi-user hosting requires separate HTTPS, cookie, abuse-control and deployment review. It is not declared production-ready for real funds.

## 15. Validation evidence and its limits

| Validation layer | Observed evidence | Limit |
| --- | --- | --- |
| Application regression | Stage-6 baseline: 101 passing tests, TypeScript and syntax checks | Baseline predates the latest additional execution/receipt tests; not all tests were rerun after every small script edit |
| Recent targeted tests | Execution-intent budgets, final receipt/raw-byte binding, proof transport and TEE settlement guards passed; subsequent changed scripts passed relevant checks | Do not add separate runs together as one freshly executed suite |
| PostgreSQL | Three targeted Linux tests passed for legacy model execution, unanswered-call behavior and TEE one-task/on-chain dependency behavior; explicit recovery-cap follow-up passed | Some chain/model boundaries use test doubles |
| Rust financial core | 12 native tests passed | Not a substitute for asynchronous chain tests |
| Sandbox | 15 scenarios in the TEE-stage pass; three later reserve/budget scenarios passed | Historical validated runs, not all rerun for documentation |
| WASI conformance | 25 supported/adversarial cases matched the intended reference behavior | Narrow supplier policy, not unrestricted semantic checking |
| Historical Intel proofs | Both dependent executions passed independent verification and offline tamper checks | Those old proofs cannot authorize the fresh order |
| Fresh funded TEE path | Extraction executed, independently verified and accepted by deployed escrow | Comparison, allocation and withdrawal not yet complete |

Gas is a practical constraint. Stateless proof helpers measured approximately 195 Tgas. The **full live extraction-acceptance transaction consumed 213.130157064938 Tgas**. A 220 Tgas prepaid limit succeeded for that packet; it is not a universal maximum. The CLI originally rejected 300 Tgas because the signer could not prepay the maximum transaction cost. This was a balance check before submission, not a failed contract execution. Future signatures need adequate spendable Testnet balance and validated gas headroom.

## 16. Deployment and public evidence

### Fresh TEE escrow

- Account: `agentwork-tee-arlosx.testnet`.
- Escrow WASM SHA-256: `363351675e1a6f5bd3c5809082372be901b302476357ebb8cae0b87104991caa`.
- Deployed NEAR code hash: `4eaQHrw1xjUjtHjJg329UvV65t7UoWzTkKUKN4vS9JvM`.
- Reviewed artifact size: 1,302,590 bytes.
- Base reserved-storage budget: 1,376,256 bytes; per-order budget: 16,384 bytes.
- Initialization, operator reserve and buyer admission were verified before funding.

| Operation | Verified transaction ID |
| --- | --- |
| Fresh account creation | `7KJBJKNrpiy3yW9nM9eYGk2ufkAJd3b6dh3P2CKKz9KL` |
| Operator top-up | `Ds31VtaW6WkvxuzCP8WpYZ5zYcujLYuwFm4wFAwCruw2` |
| Deploy and initialize | `6ettRgXCJDGa7MHGjNZ94BMLTdKeDVxN2WH8VxKKwnTc` |
| Admit buyer | `Dm6c37mr5FGvZ7X6WF2HLztL8Arbbv5xtUqyRZiCyrBb` |
| Fresh TEE order funding | `64pgPoAYdtf9qSpFejmPVuhhWYEYCvX7QJkoP7sKyQNM` |
| Prepare extraction request | `rbnzbtfYwYQBDLNGYKNZZpBaLqQSgCoCUwLxtZsxggA` |
| OutLayer extraction execution | `FhLjnm59djPbQE4P4KSostm4qJpUAiqDhbDqijsbm5qu` |
| Escrow extraction acceptance | `64zFqT3fR9Ly7YDQLxoUvGoabqLNAryCKyQSSeopS7yS` |

Fresh order: `demo-a26e7fad70d6a067cac9440ec43669646886493f84fb1f1c`. Agreement hash: `sha256:f5402369da2a035a2dd88d051a614626a7b1b21eec545c52f61bb9bf0366bbbe`.

Extraction artifact: `sha256:da6051af958ec335187ea820cf85b97cb0871da13ebaa47a4005543f75a21e75`. Contract request ID: `tee-1`. Attestation task ID: `76032`. OutLayer estimated deposit was 0.0040001 Testnet NEAR, separate from the 0.001 NEAR principal and transaction gas.

Public receipt example: [fresh extraction acceptance](https://explorer.testnet.near.org/transactions/64zFqT3fR9Ly7YDQLxoUvGoabqLNAryCKyQSSeopS7yS).

The historical contract is `arlos.testnet`. Its earlier success/withdrawal and expiry/refund demonstrations must remain labeled designated-verifier/historical evidence. They are not proof that this fresh TEE order has completed settlement.

The owner repository is [ArlosX/near-](https://github.com/ArlosX/near-). The reviewed publication currently establishes the judge artifact; this report does not claim the full current application source has already been publicly released there. The local project sits under a parent Desktop Git worktree, so source publication must use an isolated reviewed project bundle rather than staging the Desktop.

## 17. Exact current checkpoint

**Confirmed:** fresh deployment, initialization/admission/reserve checks, funding, live Gemini extraction, local report, committed TEE request, OutLayer execution, independent Intel verification and direct escrow acceptance of extraction.

**Not confirmed:** comparison artifact/report, comparison TEE preparation/execution/acceptance, full-parent allocation, actual withdrawal for this fresh order, or a fresh-profile full failure/refund completion.

Comparison was allowed to start only after the accepted predecessor was read from the chain. Its first Gemini request timed out; the explicit recovery returned HTTP 503. The owner's assessment is that connectivity is involved. This snapshot does not establish a single definitive root cause for all provider errors. Separate Supabase connection-limit errors were directly observed.

The result cutoff is **12 November 2026, 14:50:52.490 UTC**. This is an immutable deadline, not a value to extend after funding. If it passes before the required acceptances, follow the contract's expiry/refund path and explicitly create a new agreement if another success demonstration is needed. Do not present the snapshot's last observed state as a current live view after that deadline.

Earlier conversation estimated approximately 85% readiness. That is a qualitative planning estimate, not a measured completion rate or probability of winning. Significant end-to-end release gates remain.

## 18. Remaining release plan

The agreed ten-stage roadmap has stages 1–5 complete and stage 6 in progress.

| Stage | Remaining acceptance condition |
| --- | --- |
| 6 — successful TEE workflow | Real comparison, TEE acceptance, full allocation and actual withdrawal; use a valid funded agreement and respect its cutoff |
| 7 — failure/refund | Demonstrate a funded new-profile failure/expiry, blocked downstream work and full-principal refund |
| 8 — final UI acceptance | Finish new-profile UI reconciliation and test wallet, four screens, form flow, loading/errors, responsiveness and persistence |
| 9 — reproduction/demo | Verify clean-copy setup, update stale README statements, publish reviewed source and record a clear 2–3 minute demo |
| 10 — submission | Verify current official requirements and public links; owner approves publication/submission |

Immediate technical priorities are provider recovery with explicit reservation handling, sufficient signer/operator liquidity, reliable private evidence reads, final transfer reconciliation and preventing legacy/local labels from being mistaken for new-profile financial success.

No human override, cross-chain settlement, marketplace, voting tribunal or additional model-judge swarm is approved or needed to finish this path.

## 19. Suggested judge-facing presentation

Keep the main narrative to four visible steps: **freeze agreement → accept extraction → compare that exact output → allocate and claim**.

In 2–3 minutes, show the two-task dependency first, one concrete verification failure/correction, then the accepted predecessor binding and real final financial receipt when available. Explain the failure/refund alternative plainly. Move full JSON, cryptographic pins, CLI commands, raw reports and detailed event history into Evidence/Advanced.

Make these distinctions explicit in labels: sample versus live model, local pass versus TEE acceptance, allocation versus actual withdrawal, and historical designated-verifier evidence versus the new direct-proof order.

The memorable moment is a downstream task remaining locked until exact upstream acceptance, followed by payment entitlement only after the complete flow. A long operator walkthrough, a narrow verifier described as general AI truth, or an unfinished new-profile payout presented as complete would undermine that differentiation.

## 20. Reproduction and implementation map

For the existing local judge demo:

```powershell
cd "D:\Arlos\Desktop\NEAR\near-agent-work"
pnpm install --frozen-lockfile
npm run dev:console
```

Open `http://127.0.0.1:4317/demo` or the dashboard at `http://127.0.0.1:4317/`. Local fixtures require no live inference key and do not move funds.

Relevant checks are `npm run security:check`, `npm run demo:verification` and the documented WSL PostgreSQL/Sandbox commands. These are instructions, not a claim that they were rerun while writing this report.

For the authenticated workspace, the existing command is `npm run dev:console:postgres` with server-only local configuration and the required migrations/archive setup. Never copy real environment files into a public source package. Live stage-6 scripts are deadline- and checkpoint-dependent; do not blindly rerun the earlier funding commands against an already funded or expired order.

| Location | Responsibility |
| --- | --- |
| `packages/shared/src` | Domain/runtime validation, strict JSON and explicit Testnet configuration |
| `packages/agreements/src` | Agreement hashing, funding/refund/settlement intents and TEE context/execution planning |
| `packages/verification/src` | Policies, deterministic checks, rich reports, evidence packaging and replay |
| `packages/orchestration/src` | Local/PostgreSQL workflow transitions, job handling and targeted model runner |
| `packages/database/src` | PostgreSQL repositories, transactions, owner scope and private evidence |
| `packages/model/src` | Provider request/response adapters and normalized artifacts |
| `packages/judge/src`, `packages/judge-wasi` | Node reference and Rust WASI judge |
| `contracts/work-escrow` | Financial state, contract methods and direct Intel-proof gate |
| `apps/test-console` | Dashboard, authenticated HTTP service and wallet boundary |
| `scripts/stage6-success.ts` | Explicit fresh-order/model/TEE request and execution preparation |
| `scripts/stage6-proof.mjs` | Final execution receipt, archived evidence and proof-packet binding |
| `scripts/stage6-testnet.ps1` | Owner-reviewed keychain transaction commands |
| `tests`, `tests/postgres`, `tests/sandbox` | Unit/adversarial, database and actual chain-runtime tests |

Primary supporting records: `docs/release-roadmap.md`, `docs/testnet-success-stage6.md`, `docs/testnet-deployment-stage5.md`, `docs/tee-escrow-stage4.md`, `docs/tee-attestation-validation-2026-11-12.md`, the security reports and the operator runbook. Local evidence resides under `artifacts/local/`; review it for privacy and relevance before sharing.

## 21. Decisions preserved and owner approval boundaries

Preserve the dependent-task structure, fixed agreement, deterministic profile, full-parent-success allocation, full-principal refund policy, explicit TEE/legacy separation, owner-reviewed signatures, evidence hashes and the existing stack/design direction.

New judge builds, collateral/runtime pins, contract upgrades, economic changes, provider substitutions, public deployments, exposure of private evidence and submission decisions require explicit review within the owner's authorized scope. No recommendation in this report silently changes the approved specification.

The defensible current claim is a real funded first-task path through model execution, attested verification and direct contract acceptance, built on a tested dependent-work settlement architecture. The remaining proof is completion of the second task and the financial terminal paths under that same new profile.
