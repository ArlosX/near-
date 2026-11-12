# Defense-in-depth review — round 2, 2026-11-06

Implemented and tested locally. No public deployment, live-model call, credential
rotation, or remote database mutation was performed. No new runtime dependency.

## Control mapping

This is a selected-control mapping to official guidance, **not ASVS certification
or a claim to meet every ASVS requirement or level**.

| Layer | Implemented control | Evidence |
|---|---|---|
| Session lifecycle | 15-minute server-side idle timeout, 60-minute absolute timeout; exact login-origin binding | Wallet expiry/origin tests with an injected clock |
| Revoked credentials | Check the signing public key against finalized Testnet state before every authenticated POST outside auth routes; reads refresh after 60 seconds | HTTP + real local PostgreSQL test confirms revoked key cannot change order version |
| Concurrent authorization | Shared in-flight RPC check, fail closed on outage, logout cannot be undone by a late response, expired challenges cannot complete login | Wallet race/outage/expiry tests |
| Browser/API boundary | Fetch Metadata blocks same-site/cross-site API calls; exact JSON content type; duplicate auth cookies rejected; frame/referrer/object/form restrictions | Local HTTP attack tests; wallet popup opener behavior preserved (no COOP added) |
| Resource limits | Separate login burst of 12 with one token per five seconds; existing global quota; 8 KiB header bound, keepalive/request-count limits; RPC bodies bounded to 64 KiB for auth and 256 KiB for financial queries | Login flood and chunked response overflow tests |
| Unambiguous parsing | Shared duplicate-key/depth validator, including Unicode-escaped equivalent keys; strict UTF-8 for requests and RPC | Parser/transport attack tests |
| Evidence integrity | Invalid UTF-8 rejected before hashing; configured private storage requires evidence references instead of silently skipping verification | Pre-fix malformed-byte attack reproduced; fixed regression and PostgreSQL missing-reference tests |
| Settlement authorization preparation | Before preparing a new task verdict, reload archived report/artifact bytes and recompute deterministic verification recursively over accepted predecessors | Forged accepted report with recomputed hash rejected; valid dependency chain accepted |

References used:

- [OWASP ASVS 5.0 overview and official GitHub standard](https://asvs.owasp.org/)
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP REST security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [NEAR private callback guidance](https://docs.near.org/smart-contracts/security/cross-contract-calls/callbacks)

NEAR callback restrictions were already implemented and tested in round 1; they
were preserved, not replaced by additional complexity.

## Reproduced evidence-integrity flaw

The previous storage reader decoded arbitrary bytes using replacement characters,
then hashed the decoded string. A one-byte invalid sequence `FF` could therefore
match a stored hash of UTF-8 `U+FFFD`, despite different original bytes. The new
reader uses fatal UTF-8 decoding and preserves a BOM rather than silently stripping
it. The regression test failed before the fix and passes after it.

## Meaning and limits of settlement replay

The new replay runs in the trusted application before generating a **new**
`record_subtask_result` intent. It does not run inside the contract. Already signed
and recorded verdicts remain governed by the existing contract, and historical
credited orders are not rewritten. Replay verifies deterministic rules against the
frozen supported source grammar, not the truth of arbitrary documents. A malicious
verifier can still bypass this application and sign a transaction directly.

## Compatibility and operational tradeoffs

- Launching the updated server invalidates old in-memory sessions; sign in again.
  Fifteen minutes without an authenticated API request requires another login.
- Write requests now depend on successful key revalidation. RPC outage blocks
  them rather than using stale authorization. Read-side revocation is bounded by
  the 60-second cache and the next request. Finalized chain state can lag a just-
  submitted key-revocation transaction. This does not promise instant revocation.
- Storage configured on a legacy order with no archive metadata now fails closed.
  Do not fabricate metadata or disable integrity checks to restore access. Review
  and explicitly migrate exact original evidence, or use a fresh demo order.
- Login throttling is global to this single-user loopback console. It is not
  suitable as the sole public multi-user abuse control. The server still supports
  loopback HTTP only; public HTTPS deployment and Secure-cookie configuration are
  separate release work. SameSite/HttpOnly remain enabled locally.
- No contract source changed in this round. The round-1 admission contract still
  requires a signed Testnet upgrade. The previously exposed full-access key must
  be replaced/revoked; no application layer compensates for that compromise.
- Live-model adversarial testing, independent audit, protected remote audit-log
  collection, and public hosting hardening are not claimed complete. The known
  isolated Sandbox tooling advisory from round 1 remains disclosed there.

## Executed verification

- Application suite: **80 passed, zero failed**.
- Local PostgreSQL suite: **21 passed, zero failed**, including real signed-wallet
  HTTP authentication with an injected key-ownership oracle. No public wallet or
  RPC is contacted by that test.
- TypeScript strict typecheck and configured syntax checks passed.
- Rust and Sandbox were not rerun because contract source/binary did not change;
  the previous 12 native and 10 Sandbox passes are historical evidence, not counted
  again in this round's **101 tests**.

Run `npm run security:check` for application regression, type and syntax checks.
Run the local WSL PostgreSQL script from the first report for database checks.
This command is a local regression gate, not a published or executed GitHub CI job.
