# Security review — 2026-11-06

Follow-up: [round 2 hardening](security-hardening-round-2.md) supersedes this
report's login-only key revalidation limitation and adds evidence replay controls.

Scope: application source, wallet authentication, loopback HTTP, evidence storage,
PostgreSQL ownership/transactions, model orchestration, and escrow code executed
in an isolated NEAR Sandbox. No attack was sent to public Testnet, Supabase,
wallet providers, or model providers. This is an internal review, not an
independent audit or a guarantee that all vulnerabilities have been found.

## Findings and fixes

| Finding | Severity / boundary | Reproduction and change |
|---|---|---|
| Consistent fabricated source numbers pass quote-only verification | High for relying on the report to settle; verifier signature still required | A real quote plus price `1`, shipping `0`, total `2` passed. Profile v2 now checks price, shipping and delivery against the entire supported structured source and quantity/currency against approved constraints. Unsupported prose fails closed. |
| Anonymous users can consume the operator-funded lifetime order capacity | High availability; no demonstrated theft | The contract had 64 lifetime slots and no client admission. New code permits the contract account and explicitly admitted clients only. Private `set_client_admission` cannot change existing money, recipients or refunds. Admitted clients remain trusted not to exhaust the bounded demo capacity. |
| Raw server exceptions disclose internal details | Medium | Injected a database-shaped exception with a secret marker. HTTP now returns a generic 500 for unexpected errors; only explicit validation messages are returned. Invalid JSON gets a fixed message without reflecting request content. |
| Canonical serializer accepts a sparse decorated array; recursive input has no bound | Medium integrity/availability defense | `new Array(1)` with an extra property hashed as an empty array. Arrays must have exact own indices; getters, hidden/symbol properties and depth above 64 are rejected. Ordinary canonical output is unchanged. |
| Model normalization silently collapses duplicate keys | Medium integrity | Both literal and escaped equivalent duplicate keys are now preserved as invalid input for verifier rejection. The original model response remains in audit evidence. |
| PostgreSQL model path rejects ordinary formatted JSON | Functional defect | The local runner normalized JSON but PostgreSQL did not. Both now use the same bounded, duplicate-aware normalization and audit-hash comparison. Test provider returns indented JSON. |
| Prototype properties accepted as model provider names | Low validation | `constructor`, `toString`, `__proto__` failed the pre-fix rejection test. Provider lookup now requires an own allowlist entry. No credential exfiltration was demonstrated. |

Additional hardening: bounded HTTP request rate (180 burst, 3/second refill) and
16 active responses, exact static-asset lookup, and fail-closed rejection of
wallet authentication attached to an unscoped SQLite backend. Limits are for a
loopback development console, not a public-service DDoS defense.

## Compatibility and deployment

- Existing agreements and report hashes are not rewritten. New demo agreements
  freeze verification policy schema `2`. Legacy schema `1` can still be read,
  but the settlement helper will not generate a new on-chain acceptance from
  quote-only evidence. Already recorded historical results remain readable.
  An unfinished legacy order can use its existing refund/expiry path; create a
  new order for v2 verification.
- Source-fact checks intentionally support the current fixture sentence grammar,
  not unrestricted procurement documents. Source authenticity is not proven.
  Adding a new real document format requires an explicitly versioned policy.
- Admission uses a separate versioned storage key; the serialized escrow state
  layout is unchanged. Existing refund and withdrawal paths do not consult
  admission. A Testnet upgrade still requires a signed deployment and a fresh
  smoke test; local code changes do not protect an old deployed binary.
- The contract account is admitted automatically. A different customer must be
  admitted by the contract account before funding. Revocation affects only new
  orders. Only trusted demo clients should be admitted while storage is subsidized.
- Do not rerun the initial deployment script with `new` on an initialized account.
  Upgrade with a deploy-only transaction or use a fresh deployment and verify its
  code hash. No deployment transaction was sent during this review.

## Trust boundaries that remain

1. The designated verifier can lie or sign arbitrary result hashes. Hashes are
   integrity commitments, not proof of semantic correctness or a signature by
   themselves. The same demo account receiving shares and verifying is not
   independent adjudication.
2. A full-access contract-account key can replace the code. A private key was
   previously pasted into the project conversation. Treat it as compromised;
   revoke it through a separately secured key or use a fresh controlled account
   before further meaningful funds/deployment. The exposed key was not used by
   this review. Application fixes cannot repair compromised key custody.
3. Wallet sessions last one hour and are stored in memory. Key ownership is
   checked at login; revoking a key does not immediately revoke an existing
   off-chain session. Restart/logout invalidates sessions. Sessions do not grant
   the server authority to sign financial transactions.
4. Database/Storage service credentials are trusted backend privileges; RLS does
   not restrict a compromised service role. The console binds loopback and is
   not approved for public hosting. Public hosting needs HTTPS, deployment-specific
   cookie/origin configuration, per-account quotas and operational monitoring.
5. RPC providers supply trusted finality/state responses. This is not light-client
   proof verification. Unknown network outcomes are not interpreted as success.
6. Live Gemini/NVIDIA inference and adversarial live-model tests remain pending
   user credentials/access. Provider doubles validate transport and state behavior,
   not a real model's resistance to arbitrary prompt injection.

## Reproduction

Use Node 24+ and the repository's pnpm lockfile.

```text
npm test
npm run typecheck
npm run check:syntax
npm run demo:verification
npm run contract:test
npm run contract:fmt
npm run contract:build
pnpm audit --prod --json
```

On the configured local WSL installation:

```text
wsl -d NEAR-Ubuntu -u root -- bash /mnt/d/Arlos/Desktop/NEAR/near-agent-work/scripts/test-postgres-local.sh
wsl -d NEAR-Ubuntu -u root -- bash /mnt/d/Arlos/Desktop/NEAR/near-agent-work/scripts/run-sandbox.sh
```

The PostgreSQL suite uses a local Unix socket and isolated test schemas, never
`DATABASE_URL`. Sandbox creates ephemeral test accounts, not public accounts.
Security regression tests live in `tests/security.test.mjs`; financial attack
and failure-recovery tests live in `tests/sandbox/escrow.test.mjs`.

## Executed results

| Check | Result |
|---|---|
| Application suite (`npm test`) | 70 passed, 0 failed |
| Local PostgreSQL integration | 19 passed, 0 failed |
| Rust financial state tests | 12 passed, 0 failed |
| Real local Sandbox receipts/transfers | 10 passed, 0 failed; about 310 seconds |
| Final targeted HTTP/auth regressions after limiter adjustment | 10 passed, 0 failed (overlap with application suite) |
| TypeScript, syntax, Rust formatting, release Wasm build | Passed |
| Verification demo | Failure, correction and no-eligible paths passed |
| Root pnpm audit, production and development | No reported advisories |
| Separate PostgreSQL test-tool npm audit | No reported advisories |
| Separate Sandbox test-tool npm audit | 13 low-severity package entries from one transitive elliptic advisory; no moderate/high/critical entries |

Total distinct tests across the four suites: **111 passed**. Count does not
double-count the final targeted rerun. Pre-fix security regressions demonstrated
fabricated-price acceptance, sparse-array hash ambiguity and provider-name
validation failures before their fixes.

Tested Wasm SHA-256:
`2807a6c6d25ee2d02bf144478edbd95361d8f25363e15998e6979b98c86631e9`.
Local detailed Sandbox log: `artifacts/local/sandbox-latest.log`.

### Residual dependency advisory

The isolated `tests/sandbox` dependency tree includes elliptic through
`near-workspaces -> near-api-js -> secp256k1`. The registry reports 13 affected
package entries caused by [GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84),
not 13 independent flaws. The advisory lists no patched elliptic version.
The harness uses ephemeral Ed25519 Sandbox accounts; it must not be given real
private keys or reused as the product signer. npm proposes a major downgrade of
near-workspaces; that was not applied blindly because it changes the tested
runtime/tool compatibility. Replacement of the test harness crypto dependency
remains an explicit follow-up. This advisory does not appear in the root product
dependency audit. Rust dependencies were compiled/tested, not scanned with
`cargo audit` in this pass.
