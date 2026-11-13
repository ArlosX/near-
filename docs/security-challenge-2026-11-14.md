# Prooflane adversarial security and debugging challenge

Completed 14 November 2026 (Asia/Tehran). Defensive testing of the owner's local application and isolated NEAR Sandbox only. This is an engineering review, not an independent audit or a guarantee that all vulnerabilities have been found.

## Findings and fixes

### 1. Contradictory non-streaming model responses were accepted — medium validation/reliability risk

The JSON completion path accepted accompanying text even when the provider message contained a tool call. The streaming path already rejected tool calls. Related mixed refusal/text and error/success envelopes were also insufficiently rejected. No tool execution or payment authority was exposed: the returned text still had to pass artifact verification.

Reproduction: an injected local transport returned `finish_reason: stop`, JSON text, and a `tool_calls` field. The new rejection assertion failed before the patch. The adapter now rejects tool/function calls, nonempty refusal and non-null error envelopes; streaming also rejects refusal. An ordinary JSON response with null refusal remains accepted.

Changed runtime file: `packages/model/src/near-ai.ts`. No provider endpoint, credentials, attempt budget, contract or trust profile changed.

### 2. SQLite worker lease was not rechecked immediately before commit — medium local-runtime consistency risk

`LocalStore.execute` checked the worker fencing lease before its callback but not at the commit boundary. A synchronous operation crossing lease expiry could commit despite the expired lease. PostgreSQL already has a post-operation lease check; this finding is scoped to the development SQLite adapter.

Reproduction: a deterministic clock and the existing before-commit fault hook advanced time exactly to the lease expiry after state/event writes. The new test initially failed because the transaction committed. The fix rechecks the lease before both normal and replay commits. Expired operations now roll back state, events and idempotency result together; the rollback journal remains intentional.

Changed runtime file: `packages/database/src/local-store.ts`. No database schema, live database data or settlement logic changed.

## Executed results

| Layer | Result | Scope |
| --- | --- | --- |
| Application regression | 126 tests passed, 0 failed | Includes 9 newly added adversarial tests; TypeScript and syntax checks passed |
| PostgreSQL integration | 22 passed, 0 failed | Local WSL database, isolated temporary schemas, owner isolation, RLS, race conditions, rollback, lease recovery, model reservation and TEE dependency gating |
| Rust financial state | 12 existing + 2 new tests passed | 10,000 seeded wallet steps and 20,000 seeded order steps; conservation, replay, unauthorized operations and terminal state invariants |
| NEAR Sandbox | 17 passed, 0 failed | Current v3 Wasm; unauthorized calls, private callbacks, transfers, failed-transfer recovery, malformed graphs, frozen TEE context, forged acceptance, expiry refund, storage reserves and v2-to-v3 upgrade preservation |
| WASI judge parity | 25 vectors passed | Actual local Wasmtime execution compared with TypeScript decisions/checks/context commitments, including malformed JSON/UTF-8, substitution, omission, expiry and hash mismatch |
| Fixture smoke | Passed | 11 assets, 2 dependent tasks, evidence export; no credentials, cloud database or payment |

The new graph test enumerates all 4,096 directed graphs on four labeled tasks without self-edges and compares agreement validation to a separate topological elimination oracle. Other new checks cover 400 reproducibly mutated price/total pairs, 100 submission replays, 25 terminal restart attempts, 40 concurrent wallet revalidations followed by logout, and trailing Unicode line separators. The line-separator hypothesis did not reproduce a flaw; existing validators correctly rejected those inputs and were not changed.

Counts above are different suites and vector/step counts, not a single number of independent vulnerabilities or proof of exhaustive security. Generated state sequences use fixed seeds and do not cover every possible execution.

## Preserved artifacts and boundaries

- No Rust production code, deployed contract, pinned TEE measurement, judge artifact, agreement format, wallet signing flow or UI layout was changed.
- Tested v3 Wasm SHA-256: `6f9607448a279d853e3ad95e8f59b4760ccd8110bde27bc9832d94ae9789e09f`.
- Tested WASI judge SHA-256: `bb9fa85b135deb155f187f9ea49df8c907f90b885a88b90459f5bed208122051`.
- Local WASI parity is not hardware attestation. Sandbox negative-proof tests do not constitute a fresh live OutLayer execution.
- Wallet tests use locally generated ephemeral keys and an injected ownership oracle; they do not test every wallet provider or public RPC failure mode.
- Provider tests use injected transports. No fresh Gemini/NVIDIA call, Testnet signature, payment or cloud database migration was made for this challenge.
- Public deployment/reverse-proxy/TLS security, infrastructure penetration testing, independent source/cryptographic audit, fresh v3 live rejection/refund, and resistance of live models to every prompt injection remain outside the proven scope.
- The application currently binds to loopback and validates local Host/origin. Do not expose it publicly by simply changing its listen address.

## Reproduce

```powershell
npm run security:check
npm run contract:test
node scripts/test-wasi-judge.mjs
npm run demo:smoke
```

The Rust and Wasmtime checks require the documented existing local toolchains. In the configured WSL environment:

```bash
bash scripts/test-postgres-local.sh
TEST_TEE_PROFILE=v3 bash scripts/run-sandbox.sh
```

PostgreSQL tests use the fixed local Unix socket and unique test schemas, never `DATABASE_URL`. Sandbox uses locally generated accounts and does not connect to Testnet.

New reusable challenges: `tests/security-challenge.test.mjs` and `contracts/work-escrow/tests/adversarial_sequences.rs`.

Local evidence logs are intentionally excluded from the public source bundle: `artifacts/local/security-challenge-before.log`, `security-challenge-lease-before.log`, `security-challenge-final.log`, `security-challenge-rust.log`, `security-challenge-wasi.log`, `security-challenge-smoke.log`, `postgres-latest.log`, and `sandbox-latest.log`.

Initial sandboxed WSL/Wasmtime process starts were denied by environment permissions and were subsequently run with approval. A later fixture smoke invocation was not executed because the automatic approval reviewer hit a usage limit; after the user requested continuation it ran successfully. These environment failures are not counted as product test failures or successful tests.
