# Release validation — 12 November 2026

## Final checks

- 112 application/security tests passed, zero failures, both in the working tree and an isolated source copy.
- Strict TypeScript and configured syntax checks passed in both copies.
- Fresh isolated source install: pnpm 11.25.0, Node 24.16.0, pnpm install --frozen-lockfile passed.
- Key-free fixture smoke passed: seven local assets, both dependent tasks accepted, evidence package downloaded. No .env, inference key or Supabase configuration was used. Native child-process permission was required by the test host; an initial sandbox EPERM was not an application failure.
- Owner browser acceptance: arlosxq.testnet signed in via Intear, disconnected, stayed disconnected after refresh, reconnected and stayed signed in after refresh. Account isolation correctly showed no previous orders.
- Existing four-route, fixture repair/failure and narrow-screen checks remain recorded separately; no smart-contract source or deployed bytecode was changed by this wallet follow-up.

## Financial evidence

Frozen direct-proof contract: agentwork-tee-arlosx.testnet.
The complete success uses explicitly recorded model outputs and fresh OutLayer executions, not new live inference.

| Result | Verified transaction |
| --- | --- |
| Comparison accepted by direct Intel-proof gate | 5e3RtSpkG7FpueYxRADyzTvvVgmnFZgPoJUyTDmmTFtw |
| Fixed shares allocated | J2gJzDaRB5Vxb8bzRRicDthEWc7ueq6ufjagLM6xHyXP |
| Actual successful 0.001 NEAR withdrawal | HSUt319x8F59gDgJ1wsos4E8B5wtN5YKzmgMMxvrfCvd |
| Earlier incomplete-work expiry | MvqpPHLC22u4qjjZrKgNFFo7VGkFdyMV2rECRx19eL4 |
| Actual successful full-principal refund | 59CgKUj3T8k32zPyfPYhGW9Jm8Z4sfoTFBUc2BxgBCz4 |

The receipt manifest in apps/test-console/public/release-evidence.json supplies the remaining context. Allocation is distinct from payment. The refund proves incomplete-work expiry, not a separate freshly rejected live artifact path.

## Compatibility and security boundary

The wallet verifier requires Ed25519 and independently verifies NEP-413 signatures and finalized Full Access ownership. The original arlosx.testnet now has an ML-DSA key and cannot sign in through this verifier. Its orders are preserved; they were not reassigned to the new account. No cryptographic verification was bypassed to make login work.

The known exposed old arlos.testnet key was removed in CsBoyyfftFGK1rzL1k4eV659R19JnHapfzojuEe6pggX; its absence and the retained replacement key were checked. This does not certify every historical credential. The release preparation scans configured secret literals and private-key patterns and packages allowlisted source only, excluding .env.local, local artifacts and Desktop Git history.

## Remaining owner deliverables

Record the final 2–3 minute video, publish the required X demo post, supply final contact/mainnet payout fields, and approve the exact submission. Fresh provider execution remains availability-dependent; the key-free fixture is the reproducible judging path. No claim of zero defects, independent audit or competition percentile is made.
