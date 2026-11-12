-- Initial PostgreSQL core migration draft. NOT APPLIED or database-tested.
BEGIN;
CREATE TABLE work_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_account_id text NOT NULL,
 network text NOT NULL CHECK (network = 'testnet'),
 status text NOT NULL CHECK (status IN ('DRAFT','APPROVED','FUNDED','ACTIVE','SUCCESS_ELIGIBLE','SUCCESS_CREDITED','FAILED','EXPIRED','REFUNDED')),
 agreement_json jsonb,
 agreement_hash text CHECK (agreement_hash ~ '^sha256:[a-f0-9]{64}$'),
 total_amount_atomic numeric(39,0) NOT NULL CHECK (total_amount_atomic > 0 AND total_amount_atomic <= 340282366920938463463374607431768211455),
 result_cutoff_ns numeric(20,0) NOT NULL CHECK (result_cutoff_ns > 0 AND result_cutoff_ns <= 18446744073709551615),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE subtasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 work_order_id uuid NOT NULL REFERENCES work_orders(id),
 task_key text NOT NULL,
 agent_id text NOT NULL,
 runtime_version text NOT NULL,
 recipient_account_id text NOT NULL,
 allocated_amount_atomic numeric(39,0) NOT NULL CHECK (allocated_amount_atomic > 0 AND allocated_amount_atomic <= 340282366920938463463374607431768211455),
 required boolean NOT NULL DEFAULT true CHECK (required),
 status text NOT NULL CHECK (status IN ('PENDING','IN_PROGRESS','SUBMITTED','REVISION_REQUIRED','ACCEPTED','REJECTED','BLOCKED')),
 max_revisions integer NOT NULL CHECK (max_revisions BETWEEN 0 AND 3),
 revision_count integer NOT NULL DEFAULT 0 CHECK (revision_count >= 0 AND revision_count <= max_revisions),
 UNIQUE (work_order_id,task_key), UNIQUE (work_order_id,id)
);
CREATE TABLE task_dependencies (
 work_order_id uuid NOT NULL REFERENCES work_orders(id),
 predecessor_id uuid NOT NULL,
 successor_id uuid NOT NULL,
 PRIMARY KEY (predecessor_id,successor_id),
 FOREIGN KEY (work_order_id,predecessor_id) REFERENCES subtasks(work_order_id,id),
 FOREIGN KEY (work_order_id,successor_id) REFERENCES subtasks(work_order_id,id),
 CHECK (predecessor_id <> successor_id)
);
-- Application transaction service must reject cycles and assert total allocations.
CREATE TABLE deliverables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subtask_id uuid NOT NULL REFERENCES subtasks(id),
 version integer NOT NULL CHECK (version > 0),
 storage_key text NOT NULL,
 content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (subtask_id,version), UNIQUE (subtask_id,id)
);
CREATE TABLE verification_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subtask_id uuid NOT NULL REFERENCES subtasks(id),
 deliverable_id uuid NOT NULL,
 agreement_hash text NOT NULL CHECK (agreement_hash ~ '^sha256:[a-f0-9]{64}$'),
 policy_hash text NOT NULL CHECK (policy_hash ~ '^sha256:[a-f0-9]{64}$'),
 report_hash text NOT NULL CHECK (report_hash ~ '^sha256:[a-f0-9]{64}$'),
 decision text NOT NULL CHECK (decision IN ('accepted','rejected','revision_required','inconclusive')),
 checks_json jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (subtask_id,deliverable_id) REFERENCES deliverables(subtask_id,id)
);
CREATE TABLE execution_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 event_key text NOT NULL UNIQUE,
 work_order_id uuid NOT NULL REFERENCES work_orders(id),
 event_type text NOT NULL,
 payload jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 work_order_id uuid NOT NULL REFERENCES work_orders(id),
 job_type text NOT NULL,
 idempotency_key text NOT NULL UNIQUE,
 payload jsonb NOT NULL,
 status text NOT NULL CHECK (status IN ('queued','running','completed','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 lease_token uuid,
 last_error text,
 CHECK (status <> 'running' OR (lease_until IS NOT NULL AND lease_token IS NOT NULL))
);
CREATE INDEX jobs_claim_idx ON jobs(status,available_at);
CREATE INDEX subtasks_order_idx ON subtasks(work_order_id);
CREATE INDEX events_order_idx ON execution_events(work_order_id,id);
CREATE INDEX reports_task_idx ON verification_reports(subtask_id);
-- Deny client access by default. Server-only access until ownership policies are implemented.
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
COMMIT;
