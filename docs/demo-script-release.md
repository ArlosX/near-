# Two-minute judge demo

Use the current English UI. Capture video only after checking that all on-screen
financial labels match verified receipts. Keep keys, terminals with secrets and
private environment files out of the recording.

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:15 | Two-task workflow | “A spending limit does not tell you whether an agent finished the work. This agreement pays only after both dependent tasks are accepted.” |
| 0:15–0:35 | Agreement, fixed shares and locked comparison | “The buyer freezes the rules. Comparison must consume the exact accepted extraction. Passing one task alone earns no partial payment.” |
| 0:35–1:00 | Wrong total, check reason, corrected output | “This arithmetic error fails a deterministic check. The corrected version has a new artifact hash.” Label fixture/sample visibly. |
| 1:00–1:25 | Current v3 extraction acceptance receipt | “This separate real Gemini output ran through the pinned judge in OutLayer TEE. The escrow itself verified the Intel proof and accepted these exact bytes.” |
| 1:25–1:45 | Current v3 allocation and withdrawal | “Two fresh Gemini calls produced these outputs. Both TEE executions, direct contract acceptances and the full withdrawal were real.” Open the new withdrawal receipt, not the historical one. |
| 1:45–2:05 | Separate v2-profile expiry/refund | “If the whole flow does not finish, there is no partial worker entitlement. This receipt returns the full principal; gas and external execution fees are separate.” |
| 2:05–2:20 | Evidence and repository | “Run the fixture demo without keys. Evidence exposes the rules, reasons, hashes and receipts.” |

## Draft X post — owner publishes

Built at NEAR HACKATHON: Prooflane ties payment to completed dependent work.

Extract → accept → compare the exact accepted output → allocate and claim.

Our NEAR escrow directly verifies the OutLayer Intel TDX proof. No partial worker
entitlement if the required workflow fails. The demo labels sample runs and actual
Testnet evidence separately.

@NEARProtocol #NEARHackathon

Attach the final video and the reviewed public repository link. Before posting,
update any incomplete-path statement to match the final evidence. This is a draft,
not a published post or proof of submission.

## Owner acceptance checklist

- [ ] Fresh-clone setup passes with no environment file or model key.
- [ ] Four routes work; keyboard focus and mobile layout remain usable.
- [ ] Fixture errors, repair and terminal failure are understandable.
- [ ] Live TEE acceptance and historical receipts are clearly distinguished.
- [ ] New-profile refund has its actual successful callback/transfer evidence.
- [ ] New-profile full success is claimed only after actual withdrawal.
- [ ] Previously exposed keys are revoked/rotated; secret/history review complete.
- [ ] License/attribution and public source contents reviewed.
- [ ] Video, X URL, public repository and final submission payload approved.

Keep a six-hour upload/submission buffer. Verify the live official requirements
before sending the one permitted project submission. Do not invent owner contact,
mainnet payout account, consent or public links.
