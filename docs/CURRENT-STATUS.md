# Current release status — 12 November 2026

This is the current checkpoint. Earlier dated documents preserve the state at the
time they were written; statements such as “pending” in them may be superseded.

## Confirmed new-profile financial paths

Contract: `agentwork-tee-arlosx.testnet`, frozen `outlayer-tdx-direct-v1` mode.

- First funded order: real Gemini extraction accepted by the escrow after direct
  Intel proof verification. Comparison did not finish by the fixed cutoff.
- The first order was marked expired and its entire 0.001 Testnet NEAR principal
  refunded. Callback success and final `refunded` state were verified.
- Second six-hour order: unchanged recorded outputs from a previously successful
  Gemini run were explicitly replayed. No new live inference is claimed.
- Both second-order OutLayer executions were fresh. Their Intel proofs passed
  independent verification and the escrow's direct proof gate.
- Comparison consumed the exact accepted extraction. Both task results were
  accepted before fixed allocations were credited.
- Actual withdrawal of the full 0.001 Testnet NEAR credit was verified, including
  the successful private callback and absence of failed receipts.

See the public [receipt manifest](../apps/test-console/public/release-evidence.json).
The dashboard Evidence page and `/demo` expose these receipts separately from the
historical designated-verifier contract `arlos.testnet`.

## Runnable and checked

The fixture demo requires Node.js 24.16+ and dependencies, but no environment file,
wallet, inference key or Supabase. Its smoke check clears service variables,
starts a fresh SQLite instance, checks local assets, completes both tasks and
downloads evidence. It does not move funds.

Application/security, strict TypeScript and syntax checks are release gates.
Record their actual final results in the release validation report rather than
adding counts from separate historical runs. Financial proof source and deployed
bytecode were not changed for the six-hour/operator improvements.

## Remaining owner gates

- Final browser/manual acceptance and video recording.
- Public source publication/review and confirmation of the intended license.
- Previously exposed legacy `arlos.testnet` key: currently detected on that old
  account. It is absent from `arlosx.testnet` and the new TEE escrow. Revoke it
  using a retained owner-controlled Full Access key; no automatic deletion.
- X post with the video and final submission fields/consent approved by owner.

No production-readiness certification, independent audit, arbitrary source-truth
verification, new live provider execution for the replay run, or competition
percentile is claimed. Mainnet funds are outside this demonstration.
