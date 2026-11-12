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

- Video recording and final owner review of the submission.
- Public source is published at https://github.com/ArlosX/near- under owner-approved MIT; final wallet-compatibility/security follow-up is being synchronized.
- The known exposed legacy key was revoked, transaction `CsBoyyfftFGK1rzL1k4eV659R19JnHapfzojuEe6pggX`. Finalized key state confirms its absence and retention of the new owner-controlled Full Access key. Both owner wallets are now Intear. This checks the known exposed key; it is not a claim about every historical credential.
- X post with the video and final submission fields/consent approved by owner.

No production-readiness certification, independent audit, arbitrary source-truth
verification, new live provider execution for the replay run, or competition
percentile is claimed. Mainnet funds are outside this demonstration.

## Wallet compatibility

MyNearWallet no longer accepts new app connections. The dashboard now uses the official Intear V3 direct-popup protocol with a one-time NEP-413 sign-in proof. An ephemeral browser WebCrypto key authenticates the handshake only; no on-chain FunctionCall key, payment authority or provider SDK is requested. The existing server verifies the challenge, origin, signature and finalized full-access key ownership. The server-signed payload omits the optional callback URL. Owner browser acceptance passed with `arlosxq.testnet`: login, logout, remaining signed out after refresh, reconnect and remaining signed in after refresh. Its empty workspace is expected account isolation. The original `arlosx.testnet` currently has an ML-DSA key, which this Ed25519-only login does not support; its historical orders are preserved and are not reassigned.
