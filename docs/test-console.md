# Local workflow test console

## Start

    npm run dev:console

Open http://127.0.0.1:4317. The server binds to loopback only. It uses artifacts/local/console.sqlite (gitignored). Optional PORT and LOCAL_DB_PATH configure the local process. No user wallet, model key or paid service is needed.

## What is functional

- Persist an immutable synthetic agreement, policies and corpus.
- Start a task only after its predecessor passes local deterministic checks.
- Edit a JSON artifact, submit it, inspect expected/actual checks and download a report.
- Consume revisions from persisted server-owned state; terminal rejection cannot be reset through the API.
- Save state, artifact, report, events and idempotency result within one actual SQLite transaction.
- Replay a completed request without duplicate workflow writes; reject changed payload under the same key.
- Reject stale optimistic versions.
- Probe rollback and inspect COMMITTED / REPLAYED / ROLLED_BACK journal entries.
- Preserve orders/reports after browser reload and server restart.

Preset scenarios use explicitly synthetic supplier data and manually constructed/corrected outputs. They exercise the real local HTTP API, dispatcher and SQL adapter. They do not exercise an AI provider.

## Boundaries

This is a development test harness, not the planned Next.js product frontend. The plain HTML/CSS/JS console avoids framework setup during core testing. PostgreSQL remains the production database direction; LocalStore is a SQLite development adapter and does not apply or validate the PostgreSQL migrations. The console does not add a token, escrow implementation or economic approval.

CHECKS_PASSED_LOCAL is never on-chain acceptance. Local dependency context deliberately uses locally passed artifacts to test orchestration. It must not be sent to a production final-verdict service as proof of chain acceptance. No funding, withdrawal, refund or blockchain hash is fabricated. SQL transaction UUIDs are clearly labeled local identifiers.

The console has no production user authentication. It binds to 127.0.0.1, checks Host/Origin, requires a custom mutation header and applies CSP/no-store. Do not deploy it publicly or feed it secrets. These controls are not a replacement for wallet authentication/ownership checks in the product API.

Transactions are synchronous, single-connection, and use BEGIN IMMEDIATE plus optimistic versions. This is not distributed worker/lease scheduling. PostgreSQL adapter, authenticated job execution, final human/semantic approval, Rust contract and Testnet settlement remain future work.

## Validation

    npm test
    npm run test:console
    npm run typecheck
    npm run check:syntax

Latest full run: 33 tests passed; typecheck and syntax checks passed. Functional SQL tests cover rollback after artifact/report/event/state writes, exact retry, idempotency conflicts, revision exhaustion, dependency binding, stale versions, expiry, persistence, immutable SQL triggers and HTTP safeguards. HTTP also preserves split multibyte Persian text.

Browser checks performed through the actual UI: repair (3 reports), final failure (2 reports and start disabled), no eligible supplier (2 reports with null selection), manual arithmetic edit (expected 2100, actual 999), idempotent replay (report count unchanged), rollback (artifact/report/event/request counts unchanged), reload after server restart, and full two-task success. No browser console errors were observed in the final inspected tab.

Screenshot: artifacts/local/test-console.png. The screenshot and SQLite database are local generated artifacts, not submission assets.

UI skill note: ui-ux-pro-max was consulted. Its search script could not run because Python/py were unavailable; general documented accessibility guidance was used instead. System fonts, labeled controls, focus rings, status text and responsive layout are included. No Python installation was attempted.

## Durable background fixture runner
POST /api/orders/:id/enqueue with JSON {} and X-Local-Console: 1 queues the existing local order. The standalone console server checks the queue every 500 ms. Run `npm run demo:background` while the console is listening on 4317 for a complete HTTP smoke test. GET order details includes job status, attempt count and failure text.

Queue claims use a single atomic SQLite UPDATE. Each claim increments a fencing token and owns a 30-second lease. Every workflow write checks that lease inside its transaction. A crashed process leaves a reclaimable RUNNING job; restart resumes from committed task state, including a submission committed before acknowledgement. A handled error marks FAILED; explicitly enqueue again to retry. DONE jobs cannot be silently restarted. Job DONE means runner completion: inspect parent status to distinguish success, failure and expiry.

Limits: execution is synchronous synthetic fixture work, with no model/network call or lease renewal. Do not reuse this worker for long-running AI calls. Production still requires PostgreSQL jobs and worker integration. No chain acceptance or settlement has been added.
