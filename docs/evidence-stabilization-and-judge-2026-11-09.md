# Evidence stabilization and local judge preparation

## Three stabilization items completed first

1. **PostgreSQL:** 21 tests passed on the actual local PostgreSQL service. Evidence export is exercised with persisted outputs; foreign-owner and unauthenticated downloads are rejected. The runner safely waits up to 300 readiness attempts after recovery-aware startup, uses the postgres identity and saves a log. No data reset, PID-file deletion or weakened durability was introduced.
2. **UI:** Mobile Evidence at 390px has no horizontal page overflow. A repaired order with three reports was selected, the export was downloaded, and inline success feedback appeared. Export errors now use normal application feedback instead of navigating to a raw error response. The temporary viewport was reset.
3. **Source archive:** `artifacts/local/release/source-20261109-010612.zip` captured this stabilized evidence-export baseline before judge work. Inspection confirmed the evidence module, portable entry paths and no excluded credentials/databases/dependency/build directories. The final archive generated after this report also contains judge work.

## Local judge work

- Added `packages/judge/src/local-judge.ts`, a bounded canonical-input reference protocol around the existing deterministic verifier.
- Bound request ID, input bytes, local source commitment and output/report context. Strictly requires profile v2.
- Added a source manifest generator, independent file-input CLI runner and seven demo conformance vectors.
- Added five regression tests: decisions across vectors, altered/noncanonical/duplicate-key input, wrong code commitment, swapped/rehashed forged output, cross-order dependencies and legacy-policy downgrade.
- Tested the standalone CLI with an accepted saved input and rejection of a wrong input commitment.

This is **local Node.js reference code, not a WASI port**. It does not generate or validate hardware attestations, authenticate remote execution, consume durable nonces or authorize any contract verdict/payment. Expected commitments are trusted caller context. Reusing the existing verifier is not independent port conformance.

## Next local implementation gate

Port the supported full profile to `wasm32-wasip2`, execute that artifact locally, and compare it against these vectors plus boundary cases. Only after that should a real OutLayer job be attempted with provisioned access and a verified trust path. Contract-enforced TEE mode remains separate, as specified in `tee-integration-proposal.md`.

No API key, paid compute, public-chain transaction, contract deployment or owner signature was used. Current live application verification/settlement authority is unchanged and TEE remains labeled not integrated.

## Reproduce

Fresh validation after local judge work: **88 application tests passed, 0 failed**, including five judge tests. TypeScript passed. The 21 PostgreSQL passes above include the latest export access/binding assertions. Prior Rust/Sandbox passes are not counted as freshly rerun in this stage because financial contract code did not change.

```powershell
npm run security:check
npm run judge:test
npm run judge:demo
```

See `local-judge-reference.md` for saved-request execution and trust limits. Local logs: `artifacts/local/postgres-latest.log`, `artifacts/local/judge-reference-final-validation.log` and `artifacts/local/judge-reference-demo.log`.
