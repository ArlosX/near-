# OutLayer deterministic judge — scoped integration design

Status: local Node.js reference and Rust WASI implementation available. Two real OutLayer Testnet executions and independent Intel TDX attestation verification are complete; see [the validation report](tee-attestation-validation-2026-11-12.md). Direct-proof TEE acceptance is now implemented and locally tested; see [stage 4](tee-escrow-stage4.md). Fresh public deployment and newly funded TEE success/failure flows remain release gates. See `local-judge-reference.md` for the conformance runner and remaining gates.

## Existing guarantees to preserve

The agreement already commits to each task's criteria and verificationPolicyHash. The contract records the parent agreement hash. A separate per-task policy commitment is warranted when a contract-enforced TEE result must be checked directly, not merely to duplicate a hash in the UI. Local verification, funded status, accepted chain verdicts, credits and successful withdrawal remain distinct.

## Smallest meaningful TEE boundary

Port the supported deterministic fixture profile into a WASI-compatible judge: schema/identity, frozen source facts, arithmetic, dependency hash/fact preservation, budget and delivery rules. Do not attest only the presence of fields and then imply semantic correctness. LLM execution and arbitrary document truth remain outside the guarantee.

Use the existing verifier's input/output fixtures as conformance vectors. Run both implementations against valid results, fabricated prices, altered predecessor facts, omitted suppliers, wrong hashes, duplicate keys, invalid UTF-8, stale revisions and cross-order substitutions. Native and TEE decisions must match before settlement integration.

## Bound request and result

The contract must commit before dispatch to: chain/network, escrow account, order ID, agreement hash, task ID, policy/criteria commitment, approved judge WASM hash, exact input bytes hash, artifact hash/version, accepted predecessor artifact hashes, a unique request ID and result cutoff. No worker-supplied replacement of these values.

The returned decision must bind the same context and exact output bytes. Platform attestation authenticity, approved worker measurements, judge WASM hash and input/output commitments must be verified using the documented trust path. An attestation URL, job ID or arbitrary relay assertion is not proof.

## Prevent bypass

Introduce a separate versioned deployment/profile. Funding freezes verificationMode, policy commitment and judge code commitment. In TEE mode, ordinary designated-verifier signatures cannot call the acceptance path. No downgrade to legacy verification after funding.

Prefer the documented NEAR → OutLayer → authenticated callback route. Verify platform/callback predecessor and originating request, then compare every persisted commitment; private callbacks must not be externally callable. Confirm with the actual OutLayer contract API that the returned result follows its attestation-verified execution path. Do not assume a callback alone proves the complete attestation chain. If that binding cannot be established, stop the on-chain trust claim rather than introducing an unverified relay.

Consume a request once; reject replay, different network/escrow/order/task, altered code or policy, stale artifact version, missing accepted dependencies, late acceptance and terminal orders. Attestation and transport failures must fail closed and preserve existing expiry/refund rules. No automatic accept, partial payment or human bypass.

## Cost and implementation gates

1. Confirm a usable OutLayer Testnet execution route, supported WASI target, request/response ABI, approved workers, limits and availability.
2. Confirm a free allocation or obtain explicit owner approval for a bounded execution budget. HTTPS documentation describes prepaid USDC Payment Keys; do not assume free service.
3. Build the judge and conformance suite locally. Moderate implementation cost; porting the complete supported profile is larger than a decorative hash check.
4. Implement and adversarially test the new contract mode and authenticated result path in Sandbox. High integration cost because this changes settlement authority.
5. Owner deploys a fresh versioned Testnet contract, configures admission/reserves and approves backend switching. Historical contracts/evidence remain identifiable.
6. Execute real valid, invalid, replay and timeout jobs; publish verifiable job/attestation links only after checking their bindings. Until then UI says **TEE not integrated**.

Do not describe phases 1–3 as decentralized settlement or claim that hardware makes an incorrect rule correct. TEE adds execution integrity subject to hardware/vendor, approved-measurement governance and platform trust assumptions.

## Current deliverable independent of TEE

`GET /api/orders/:id/evidence-package` downloads the owner's immutable agreement, sources, policies, exact artifact bytes and report envelopes. Deliveries include task/agent identity, runtime version, agreement schema version/hash, criteria/policy hashes, output version/hash, dependencies and service evaluation timestamp. Export checks archived hashes/bindings and rejects a changed workflow version. It does not sign the export or prove independent time, semantic truth, chain acceptance or payment.

The parent agreement hash already commits to task criteria and policies. No existing contract layout or financial authority was modified in this implementation pass.

## Official references reviewed 2026-11-09

- https://app.outlayer.ai/docs/tee-attestation
- https://app.outlayer.ai/docs/trust-verification
- https://app.outlayer.ai/docs/getting-started
- https://app.outlayer.ai/docs/web2-integration

Competitor rankings and submission counts supplied in the competitive brief were not independently established by this design review.
