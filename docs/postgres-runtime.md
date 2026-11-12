# PostgreSQL execution runtime — stage 1

The loopback console can now persist fixture workflows using PostgreSQL/Supabase.
SQLite remains available for isolated regression tests. Existing SQLite records are
not silently copied into Supabase.

## Run

From the repository directory with DATABASE_URL and DATABASE_CA_PATH in .env.local:

```powershell
npm.cmd run db:migrate:execution
npm.cmd run dev:console:postgres
```

Open http://127.0.0.1:4318. This is a local test console with a fixed synthetic
identity, fixture outputs and no wallet, live model or blockchain settlement.
Do not expose this service publicly before the wallet authentication stage.
Starting the console does not apply migrations. Migration 0004 is additive and
transactional; the original nine-table setup must already exist. The manual SQL
equivalent is supabase/setup/002_execution_runtime.sql.

An explicit integration check creates and retains one synthetic order:

```powershell
npm.cmd run db:smoke
```

It tests creation/submission replay, rollback, disconnect/reconnect, queued
dependent execution and two persisted reports. It makes no model or chain calls.

## Persistence and boundaries

- One PostgreSQL transaction commits approved snapshot, policies, tasks, graph,
  runtime configuration/state, audit events and idempotent command result.
- Deliverable bytes (at most 1 MB) temporarily live in a private PostgreSQL column.
  Stage 2 connects private object storage; no public storage URL is invented.
- Reports and artifacts remain immutable, versioned and hash bound. Commands
  serialize on the order row; stale expected versions are rejected.
- workflow_runs keeps execution state separate from financial work_orders.status.
  Fixture checks leave financial status APPROVED; checked subtasks map to
  SUBMITTED, never on-chain ACCEPTED. Deterministic dependency checks are a
  simulation, not proof of final chain acceptance or semantic truth.
- Only fixture_execution jobs are claimed by this worker. Reconciliation jobs
  remain separate. Tokens fence expired workers at each transactional commit.
  Crashes retain committed steps and recover after lease expiry, within three
  attempts. Enqueue does not reset exhausted attempts or completed jobs.
- Read details uses a repeatable-read transaction. Command timestamps and history
  come from persisted PostgreSQL records. Intentional rollback probes leave no
  command row: this view is committed command history, not a failed-request log.
- The same deterministic checker and pure task transition functions are reused
  by both local and PostgreSQL adapters. Async service orchestration is separate.

## Local integration tests

```powershell
wsl.exe -d NEAR-Ubuntu -u root --exec bash /mnt/d/Arlos/Desktop/NEAR/near-agent-work/scripts/test-postgres-local.sh
```

The suite uses fixed local Unix sockets and isolated schemas in near_agent_dev;
it never uses DATABASE_URL. It covers foundation constraints, RLS, full workflows,
revision exhaustion, crash recovery, concurrent commands, rollback and HTTP.


## Stage 2 update
Private object storage is now integrated. Configure SUPABASE_SERVICE_ROLE_KEY,
apply `npm run db:migrate:evidence`, then restart the console. New artifact bytes
live in the private bucket; old inline records remain readable. See
[private-evidence.md](private-evidence.md) for integrity and rollback boundaries.
