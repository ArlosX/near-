# Operator runbook

Current financial status: [CURRENT-STATUS.md](CURRENT-STATUS.md). Both fresh TEE financial terminal paths are now verified; do not rerun historical funding commands.

## Reproducible local demo

Use Node.js 24 or later. From the repository root:

```powershell
pnpm install --frozen-lockfile
npm run security:check
npm run demo:verification
npm run dev:console
```

Open http://127.0.0.1:4317. This fixture console needs no wallet, API key or Supabase account. It persists local sample orders in SQLite. Keep the terminal running. It does not execute live AI or move NEAR.

The authenticated development console uses existing server-side settings:

```powershell
npm run dev:console:postgres
```

Open http://127.0.0.1:4318. Sign in with a Testnet wallet. A server restart clears in-memory sessions; reconnect afterward. Do not open index.html directly. Do not expose these loopback development servers publicly.

## Ninety-second demo

1. Explain: two dependent tasks share one agreement; local checks do not themselves authorize payment.
2. In Workflow choose **Wrong total → repair → pass**. This creates its own sample order. Show the failed total check, corrected extraction and comparison consuming the accepted result in Evidence.
3. Show the failed extraction report, the corrected report and the accepted comparison report in Evidence. Explain the dependency hash.
4. Show the fixed agreement and local workflow status separately from financial state.
5. Open `/demo` for historical Testnet success/withdrawal and expiry/refund evidence. Do not resend historical funding transactions to reproduce the presentation.
6. Show README reproduction instructions. The first TEE extraction used live Gemini; the complete second-order payout used explicitly recorded worker-output replay with fresh TEE execution.

## Test gates

```powershell
npm run security:check
npm run contract:test
npm run contract:fmt
npm run contract:build
wsl -d NEAR-Ubuntu -u root -- bash /mnt/d/Arlos/Desktop/NEAR/near-agent-work/scripts/test-postgres-local.sh
wsl -d NEAR-Ubuntu -- bash /mnt/d/Arlos/Desktop/NEAR/near-agent-work/scripts/run-sandbox.sh
```

WSL commands above reflect this development machine, not a universal installation path. Sandbox uses ephemeral test accounts. Never give its harness a real signing key.

## Offline deployment preparation

After a successful build and financial test gates:

```powershell
node scripts/prepare-deployment.mjs
```

This creates `artifacts/local/deployment-review/manifest.json` and `OWNER-STEPS.md`. It does not sign, send, load secrets or prove build provenance. Optional argument: a fresh named `.testnet` contract account. Review the instructions before any transaction. The historical deploy script is disabled to prevent reinitializing the existing escrow with an obsolete artifact.

The fresh hardened contract requires client admission and storage reserve. Once the owner has deployed and checked the code hash, set `NEAR_NETWORK=testnet`, `NEAR_CONTRACT_ID=<fresh account>` and `NEAR_VERIFIER_ACCOUNT_ID=<verifier>` in the local environment. Restart the PostgreSQL console and create a new order. Existing agreements retain their original contract. Verify funding, both verdicts, allocation and successful withdrawals on one order. On a second funded order verify expiry or final failure and the successful refund transfer. Record the final receipt IDs before using the fresh deployment in the demo.

## Live model handoff

Set `MODEL_PROVIDER`, `MODEL_NAME` and `MODEL_API_KEY` in the local environment. Use a fresh, active order without a fixture job. From the project directory:

```powershell
npm run model:postgres -- --check
npm run model:postgres -- --run <wallet-account> <new-order-id>
```

The first command checks configuration locally. The second sends live provider requests and requires the configured PostgreSQL and private evidence storage. Expect `CHECKS_PASSED_LOCAL` and inspect the extraction and comparison reports under Evidence. A local pass still requires the designated verifier for on-chain acceptance.

## Owner checkpoints

- Provide model credentials locally and approve a provider/model that meets the free-API requirement. Never paste a key into chat.
- Sign wallet login/deployment/financial transactions personally.
- Use a signing key that has not previously been exposed; the assistant cannot revoke or rotate it on your behalf without your participation.
- Review visual behavior in your normal browser: disconnected welcome, all four screens, dropdown keyboard navigation, mobile, background pause and hover.
- Review public repository contents, record the demo, and approve public posting/submission. Drafts are in `docs/submission.md`.

## Troubleshooting

- Connection unavailable: confirm the server terminal is running and use the correct port.
- RPC unavailable: authenticated writes fail closed. Wait for recovery and read current state before retrying; do not blindly resend transactions.
- Session expired: reconnect the same account; drafts are scoped to the account, order and browser tab.
- Duplicate order on-chain: read the existing order/funding state instead of funding it again.
- Allocated shares: allocation is not withdrawal. Confirm the recipient's claim and successful receipt separately.
- Missing private evidence: investigate the original archive. Do not disable integrity checks or fabricate metadata.
