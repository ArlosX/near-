-- NEAR Agent Work: initial backend schema, first run only.
-- Paste this entire file into Supabase SQL Editor and run as the project owner.
-- Fails without modifying an existing near_agent_work schema. No DROP/reset.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE SCHEMA near_agent_work;
REVOKE ALL ON SCHEMA near_agent_work FROM PUBLIC;
SET LOCAL search_path TO near_agent_work,pg_catalog;
-- 0001_workflow_core.sql
-- Initial PostgreSQL core migration draft. NOT APPLIED or database-tested.

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


-- 0002_verification_binding.sql
-- Draft only: apply after 0001 on a clean reviewed database. Not executed in this task.

CREATE TABLE verification_policies (
 policy_hash text PRIMARY KEY CHECK (policy_hash ~ '^sha256:[a-f0-9]{64}$'),
 policy_json jsonb NOT NULL CHECK (jsonb_typeof(policy_json) = 'object'),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE subtasks ADD COLUMN verification_policy_hash text NOT NULL REFERENCES verification_policies(policy_hash);
ALTER TABLE verification_reports ADD CONSTRAINT reports_policy_fk FOREIGN KEY (policy_hash) REFERENCES verification_policies(policy_hash);
ALTER TABLE verification_reports ADD COLUMN source_manifest_hash text NOT NULL CHECK (source_manifest_hash ~ '^sha256:[a-f0-9]{64}$');
ALTER TABLE verification_reports ADD COLUMN artifact_hash text NOT NULL CHECK (artifact_hash ~ '^sha256:[a-f0-9]{64}$');
ALTER TABLE verification_reports ADD COLUMN artifact_version integer NOT NULL CHECK (artifact_version > 0);
ALTER TABLE verification_reports ADD COLUMN revision integer NOT NULL CHECK (revision >= 0 AND artifact_version = revision + 1);
ALTER TABLE verification_reports ADD COLUMN scope text NOT NULL CHECK (scope = 'deterministic_only');
ALTER TABLE verification_reports ADD COLUMN report_json jsonb NOT NULL CHECK (jsonb_typeof(report_json) = 'object');
ALTER TABLE deliverables ADD CONSTRAINT deliverable_id_hash_unique UNIQUE (id,content_hash);
ALTER TABLE verification_reports ADD CONSTRAINT report_artifact_fk FOREIGN KEY (deliverable_id,artifact_hash) REFERENCES deliverables(id,content_hash);
-- Canonical hash computation and JSON/column consistency must be checked by the future repository.
-- Hashes are not recomputed from jsonb: its byte representation differs from canonical JSON v1.
CREATE FUNCTION reject_verification_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Immutable verification record: insert a new version instead' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER immutable_verification_policies BEFORE UPDATE OR DELETE ON verification_policies FOR EACH ROW EXECUTE FUNCTION reject_verification_mutation();
CREATE TRIGGER immutable_verification_reports BEFORE UPDATE OR DELETE ON verification_reports FOR EACH ROW EXECUTE FUNCTION reject_verification_mutation();
CREATE TRIGGER immutable_deliverables BEFORE UPDATE OR DELETE ON deliverables FOR EACH ROW EXECUTE FUNCTION reject_verification_mutation();
ALTER TABLE verification_policies ENABLE ROW LEVEL SECURITY;


-- 0003_repository_guards.sql
-- Apply only on a clean development schema after 0001 and 0002.

ALTER TABLE work_orders ADD COLUMN contract_id text NOT NULL;
ALTER TABLE work_orders ADD COLUMN order_key text NOT NULL;
ALTER TABLE work_orders ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE work_orders ADD COLUMN snapshot_bytes text NOT NULL;
ALTER TABLE work_orders ADD COLUMN snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^sha256:[a-f0-9]{64}$');
ALTER TABLE work_orders ADD CONSTRAINT chain_order_unique UNIQUE(network,contract_id,order_key);
CREATE FUNCTION freeze_approved_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.client_account_id IS DISTINCT FROM OLD.client_account_id OR NEW.network IS DISTINCT FROM OLD.network
 OR NEW.contract_id IS DISTINCT FROM OLD.contract_id OR NEW.order_key IS DISTINCT FROM OLD.order_key
 OR NEW.agreement_json IS DISTINCT FROM OLD.agreement_json OR NEW.agreement_hash IS DISTINCT FROM OLD.agreement_hash
 OR NEW.total_amount_atomic IS DISTINCT FROM OLD.total_amount_atomic OR NEW.result_cutoff_ns IS DISTINCT FROM OLD.result_cutoff_ns
 OR NEW.snapshot_bytes IS DISTINCT FROM OLD.snapshot_bytes OR NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
 THEN RAISE EXCEPTION 'Immutable approved snapshot'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_order_snapshot BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION freeze_approved_order();
CREATE FUNCTION freeze_subtask_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'status'-'revision_count') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'revision_count')
 THEN RAISE EXCEPTION 'Immutable subtask allocation'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_subtask_allocation BEFORE UPDATE ON subtasks FOR EACH ROW EXECUTE FUNCTION freeze_subtask_allocation();
CREATE TRIGGER immutable_subtask_delete BEFORE DELETE ON subtasks FOR EACH ROW EXECUTE FUNCTION reject_verification_mutation();
CREATE TRIGGER immutable_dependency_change BEFORE UPDATE OR DELETE ON task_dependencies FOR EACH ROW EXECUTE FUNCTION reject_verification_mutation();
CREATE FUNCTION bind_approved_dependency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM work_orders o
  JOIN subtasks p ON p.id=NEW.predecessor_id AND p.work_order_id=o.id
  JOIN subtasks s ON s.id=NEW.successor_id AND s.work_order_id=o.id
  CROSS JOIN LATERAL jsonb_array_elements(o.agreement_json->'tasks') AS t
  WHERE o.id=NEW.work_order_id AND t->>'id'=s.task_key AND (t->'dependsOn') ? p.task_key
 ) THEN RAISE EXCEPTION 'Dependency not in approved agreement'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER approved_dependency_only BEFORE INSERT ON task_dependencies FOR EACH ROW EXECUTE FUNCTION bind_approved_dependency();
CREATE TABLE command_results (
 actor_account_id text NOT NULL,request_id text NOT NULL,work_order_id uuid NOT NULL REFERENCES work_orders(id),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^sha256:[a-f0-9]{64}$'),result_json jsonb NOT NULL,
 PRIMARY KEY(actor_account_id,request_id)
);
CREATE TRIGGER immutable_command_results BEFORE UPDATE OR DELETE ON command_results FOR EACH ROW EXECUTE FUNCTION reject_verification_mutation();
CREATE TRIGGER immutable_execution_events BEFORE UPDATE OR DELETE ON execution_events FOR EACH ROW EXECUTE FUNCTION reject_verification_mutation();
ALTER TABLE jobs ADD COLUMN max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 10);
ALTER TABLE jobs ADD COLUMN fingerprint text NOT NULL;
ALTER TABLE command_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA near_agent_work FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA near_agent_work FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA near_agent_work FROM PUBLIC;
DO $permissions$
DECLARE role_name text; f record;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON SCHEMA near_agent_work FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA near_agent_work FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA near_agent_work FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA near_agent_work FROM %I',role_name);
  END IF;
 END LOOP;
 FOR f IN SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='near_agent_work' LOOP
  EXECUTE format('ALTER FUNCTION near_agent_work.%I() SET search_path TO near_agent_work,pg_catalog',f.proname);
 END LOOP;
END;
$permissions$;
-- Successful result should report 9 tables and RLS enabled on all 9.
SELECT 'near_agent_work' AS schema_name,count(*) AS tables_created,
 count(*) FILTER(WHERE c.relrowsecurity) AS tables_with_rls
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='near_agent_work' AND c.relkind='r';
COMMIT;
