-- Draft only: apply after 0001 on a clean reviewed database. Not executed in this task.
BEGIN;
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
COMMIT;
