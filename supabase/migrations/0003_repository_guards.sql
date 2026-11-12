-- Apply only on a clean development schema after 0001 and 0002.
BEGIN;
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
COMMIT;
