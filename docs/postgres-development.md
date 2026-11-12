# PostgreSQL repository foundation

Validated on local PostgreSQL 18.6 in NEAR-Ubuntu: eight integration tests passed (6374 ms). Supabase connection placeholders remain empty at the owner's request. No remote connection or migration was performed.

## Implemented
- The three migrations create a clean, dedicated schema with immutable approved snapshots, frozen recipient/allocation/dependency fields, policies, reports, artifacts and append-only events/command results.
- PostgresStore.createApproved validates the agreement, source manifest and policies before atomically inserting the snapshot, task graph, policy references, event and scoped idempotency result.
- Concurrent identical approval requests create one graph; changed payload under the same request ID is rejected.
- getOwned checks the service-supplied account and validates snapshot integrity. The repository is internal trusted server code; this is not signed wallet authentication.
- Reconciliation jobs use durable enqueue fingerprints, SKIP LOCKED claims, server-clock leases, new claim tokens, immutable attempt caps and transactional stale-completion rejection. The queue currently schedules reconciliation work only, not funded agent execution.
- RLS is enabled with no browser allow policies. A reader role granted SQL SELECT still sees no work orders. Server owner/superuser bypass is separate from client access.

## Local execution
From Windows, run through the existing project distro:

    wsl -d NEAR-Ubuntu -u root --exec bash /mnt/d/Arlos/Desktop/NEAR/near-agent-work/scripts/setup-postgres-local.sh

This starts local cluster 18/main, creates near_agent_dev only if absent, installs the isolated tests/postgres lockfile and runs tests as the Linux postgres user over a Unix socket. It never reads DATABASE_URL. Each test creates a unique near_test_* schema, applies migrations there and retains it for inspection; no public schema is reset or dropped. Reader roles are created inside a transaction and rolled back.

PostgresStore uses an injected SQL pool, so the production driver/connection owner must supply correct TLS, credentials and trusted authentication context. No secrets or insecure TLS overrides are embedded.

## Future Supabase connection
Keep DATABASE_URL in .env.local. npm run db:check performs syntax-only inspection and emits no credential value and no network call. A successful configuration check is not a tested connection. Do not apply these migrations blindly to populated schemas: 0002 and 0003 introduce required columns and require a reviewed migration/backfill plan for existing data.

Before remote writes: identify a development project/schema, inspect existing objects, review migration scope and validate the connection. Existing Supabase data must not be reset. Use the official Connect dialog for the direct/session connection string; password and service keys stay out of chat and frontend code.

## Still pending
The application console/model runner still use SQLite. PostgreSQL approved-order and queue services are tested foundations, not a fully switched production backend. Transactional artifact/report submission, object storage, authenticated API integration, chain reconciliation/verification authority and ownership RLS allow policies remain to be integrated. An APPROVED row does not establish chain funding or authorize execution/payment. No automated test or job fakes a real Testnet funding event.

Reference: https://www.postgresql.org/docs/current/sql-select.html (queue-like SKIP LOCKED use); https://supabase.com/docs/guides/database/connecting-to-postgres (connection modes).
`nOne-shot Supabase SQL Editor setup: supabase/setup/001_initial_setup.sql combines migrations 0001-0003 in one transaction, creates only near_agent_work, revokes public/client access and pins trigger function search paths. Validated verbatim on local PostgreSQL: nine tables, all nine with RLS. Remote execution remains pending the owner running this file. Existing schema causes an error rather than reset or overwrite.
