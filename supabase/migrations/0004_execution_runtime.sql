-- Additive runtime storage. Does not change funding or settlement status.
BEGIN;
CREATE TABLE workflow_runs (
 work_order_id uuid PRIMARY KEY REFERENCES work_orders(id),
 config_bytes text NOT NULL,
 config_hash text NOT NULL CHECK(config_hash ~ '^sha256:[a-f0-9]{64}$'),
 state_json jsonb NOT NULL CHECK(jsonb_typeof(state_json)='object'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION freeze_workflow_config() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.work_order_id IS DISTINCT FROM OLD.work_order_id
 OR NEW.config_bytes IS DISTINCT FROM OLD.config_bytes OR NEW.config_hash IS DISTINCT FROM OLD.config_hash
 THEN RAISE EXCEPTION 'Immutable workflow configuration'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_workflow_config BEFORE UPDATE ON workflow_runs FOR EACH ROW EXECUTE FUNCTION freeze_workflow_config();
CREATE TRIGGER immutable_workflow_delete BEFORE DELETE ON workflow_runs FOR EACH ROW EXECUTE FUNCTION reject_verification_mutation();
-- Temporary private byte storage until object storage is connected in stage 2.
-- Existing deliverables remain valid and immutable.
ALTER TABLE deliverables ADD COLUMN artifact_bytes text CHECK(octet_length(artifact_bytes)<=1000000);
ALTER TABLE command_results ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE command_results ADD COLUMN operation text NOT NULL DEFAULT 'createApproved';
REVOKE ALL ON workflow_runs FROM PUBLIC;
REVOKE ALL ON FUNCTION freeze_workflow_config() FROM PUBLIC;
DO $guard$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON workflow_runs FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON FUNCTION freeze_workflow_config() FROM %I',role_name);
  END IF;
 END LOOP;
 EXECUTE format('ALTER FUNCTION %I.freeze_workflow_config() SET search_path TO %I,pg_catalog',current_schema(),current_schema());
END;
$guard$;
COMMIT;
