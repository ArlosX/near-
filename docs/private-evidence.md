# Stage 2 — private evidence storage

Server-only Supabase Storage uses bucket `near-work-evidence`, private and limited
to 1,000,000 bytes per JSON object. SUPABASE_SERVICE_ROLE_KEY stays in .env.local;
it is never returned to the test console. Data API remains unnecessary for the
PostgreSQL repository and is not enabled by this change.

Run `npm run db:migrate:evidence` after migration 0004, then
`npm run dev:console:postgres`. Startup validates the migrations and private bucket;
it does not silently apply SQL. `npm run db:smoke` retains a synthetic hosted order
and validates the complete evidence path, replay, rollback and reconnect.

New orders archive the canonical source corpus. Each new submission archives
its exact UTF-8 artifact and canonical report envelope. Server-generated keys
contain order UUID, kind, task/version and SHA-256. Upsert is disabled. Even on
an upload retry, downloading and hashing the stored bytes is required before a
reference is committed. Existing content cannot be silently replaced by this
adapter; an administrator with privileged access can alter objects, which hash
verification detects. This is not a decentralized or WORM storage claim.

Migration 0005 adds immutable `evidence_objects` references, size, hash and version
with RLS and no client policies. Artifact storage_key points to the private object;
new artifacts do not duplicate bytes in deliverables.artifact_bytes. Source and
report JSON remain in the approved snapshot/report records as audit context.
Dependent-task artifact reads and report downloads verify stored bytes. Legacy
PostgreSQL artifacts remain readable; this migration does not rewrite old rows.

Storage writes and PostgreSQL commits are not one distributed transaction. Files
are uploaded/verified first, then references, report, state, event and request
result commit together in SQL. A failed SQL command may leave an unreferenced
private object; it cannot create a committed accepted report or payout. No online
cleanup deletes objects during rollback, because another valid operation could
reference the same content. A future retention job must reconcile committed
references and a grace period before removal. No cleanup daemon is needed for
the bounded MVP fixtures.

The loopback console still has a fixed fixture identity. It does not expose raw
Storage URLs or signing keys; public hosting waits for wallet authentication.
No browser upload policies, public URLs or signed links are added in this stage.

References: [Supabase upload](https://supabase.com/docs/reference/javascript/storage-from-upload),
[download](https://supabase.com/docs/reference/javascript/storage-from-download),
[Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
