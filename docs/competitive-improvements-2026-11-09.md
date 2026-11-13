# Competitive improvements — implementation status

> Historical milestone snapshot — this document preserves the implementation stage named below, not the final release status. For the completed v3 live workflow and current limits, use [CURRENT-STATUS.md](CURRENT-STATUS.md) and the [final pre-release audit](final-pre-release-audit-2026-11-13.md). Do not interpret old “pending” statements as current release gates.

## Implemented

- Owner-scoped evidence download at `/api/orders/:id/evidence-package`, available through Evidence.
- Frozen agreement, policies/sources, agent/runtime identity, task/output version, exact artifact bytes, criteria/policy/output/report/package hashes and dependency IDs.
- Read archived reports/artifacts through the existing store, verify hash/context bindings and fail closed on a changing workflow version. No fallback to fabricated archive metadata.
- Offline hash/binding checker: `node scripts/check-evidence-package.mjs FILE.json`. It explicitly does not establish authenticity, TEE execution, independent time, semantic correctness or payment.
- Workflow guidance distinguishes local success, chain verdicts, allocation and withdrawal. Final failure/expiry explains no partial worker entitlement and separate contract refund eligibility/claim.
- Updated README reproduction instructions.

## Existing decisions preserved

- Criteria and verificationPolicyHash already participate in the frozen agreement hash. No redundant on-chain hash field was added.
- Full-parent success and full refund on eligible final failure/expiry remain unchanged.
- Human override is excluded. No funded-agreement amendment, bypass or new signer authority was introduced.

## Prepared locally, not active

`tee-integration-proposal.md` specifies the minimum meaningful deterministic judge, committed context, authenticated OutLayer return path, replay/cutoff constraints and a TEE-only acceptance mode that ordinary verifier signatures cannot bypass. It is a design, not implemented contract logic.

The owner confirmed no OutLayer credit/access is currently available and requested local preparation/design only. No payment key was provisioned, paid service called, TEE job run or contract deployed. Evidence exports accurately say `tee: not-integrated`.

## Validation

- 83 application tests passed, 0 failed (three new evidence-package regressions).
- TypeScript and syntax checks passed; the new offline-checker and evidence module also passed explicit syntax checks.
- Fresh browser download of a real local two-output order succeeded. Offline verification of that downloaded file passed; an altered artifact was rejected.
- Follow-up stabilization: **21 fresh PostgreSQL integration tests passed**, including evidence-package export with exact persisted artifact bytes, owner-only download, foreign-owner denial and unauthenticated denial. The local runner now waits safely for WSL recovery, checks readiness as the postgres user and saves `artifacts/local/postgres-latest.log`. No data reset or durability reduction was used.
- The refreshed mobile Evidence screen has no horizontal document overflow. Download was exercised through the UI, including the new inline error/success feedback path; failures do not navigate to a raw error document.
- Financial contract source was not changed. Previous Rust/Sandbox results remain historical; no new run is implied.

Earlier source ZIPs predate these changes. Run `scripts/prepare-source.ps1` again before using a release archive.

No competitor superiority, rank percentile or submission count was established by this work.
