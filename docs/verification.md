# Policy-bound deterministic verification

## Entry point

packages/verification/src/index.ts exports verifySubmission. It validates the approved agreement hash, task policy hash, exact policy criteria, frozen source manifest and canonical worker artifact before producing a report. It runs only registered checker versions. No LLM-generated code is executed.

The service supplies approvedAgreementHash, evaluatedAtNs, revision and acceptedDependencies from authoritative persistence/chain reconciliation. Workers supply only artifact bytes. This stateless module does not authenticate callers, prove chain acceptance, persist state, prevent resetting a revision counter or reverse terminal decisions. Those guarantees belong to the next orchestration/repository layer.

## Supported profile

Extraction has no predecessor; comparison has one accepted predecessor. One source document represents one supplier in this first demo. Coverage rejects omission/duplicate source use. Comparison preserves the accepted supplier facts and must choose a demonstrably eligible supplier, or null if no supplier is demonstrated eligible. Unknown delivery does not establish eligibility. No live FX/tax inference.

Source, supplier and artifact sizes are bounded. Artifact bytes must be canonical JSON v1; duplicate JSON keys, malformed values and unsupported fields cannot quietly pass. Exact supplier costs/currency/quantity are runtime validated. The schema remains under development before any production persistence/funding.

## Hash semantics

Agreement, policy, source manifest and report hashes use project canonical JSON v1. Artifact hashes cover the exact canonical UTF-8 artifact string. Do not hash a parsed artifact with an unrelated serialization. Tasks now require verificationPolicyHash; pre-existing development fixtures must be regenerated.

Report bodies contain artifact version/revision, all binding hashes, evaluation metadata, checker versions and expected/actual feedback. Reports are deeply frozen in memory. Distinct versions produce distinct report hashes. verifyReportIntegrity checks content integrity only: a recomputed hash is not a signature. evaluatorAccountId is declared metadata.

An accepted report is explicitly deterministic_only. It is NOT permission for on-chain acceptance/settlement. Semantic truth and accuracy of numerical extraction from quoted text remain outside these checks. Human/semantic review and the authorized final-verdict service are not implemented yet.

## Revisions and failures

Malformed artifacts generate schema failure feedback. A failed check produces revision_required while below the task limit; the last allowed failed revision produces rejected. Tampered agreement/policy/source or corrupted authoritative context throws instead of evaluating untrusted replacement configuration. A later caller must enforce terminal state and revision consumption transactionally; re-invoking this pure function is not a new authorized attempt.

## Persistence draft

0002_verification_binding.sql adds policy records, task policy references, report/artifact bindings and update/delete rejection triggers for policies, deliverables and reports. Migrations have NOT run on PostgreSQL. The future repository must compute canonical hashes and enforce report JSON/column consistency and transactional events. Database-owner authority is not eliminated by triggers.

## Try it

    npm run demo:verification

Writes three synthetic example reports to artifacts/local/verification-demo: bad arithmetic, a manually corrected new artifact version, and a valid no-eligible-supplier result. No AI, database, signature, wallet or chain transaction occurs.
