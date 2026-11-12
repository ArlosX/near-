BEGIN;
SET LOCAL search_path TO near_agent_work,pg_catalog;
CREATE TABLE evidence_objects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 work_order_id uuid NOT NULL REFERENCES work_orders(id),
 kind text NOT NULL CHECK(kind IN ('sources','artifacts','reports')),
 task_key text NOT NULL DEFAULT '',
 version integer NOT NULL CHECK(version>=0),
 storage_key text NOT NULL UNIQUE,
 content_hash text NOT NULL CHECK(content_hash ~ '^sha256:[a-f0-9]{64}$'),
 byte_count integer NOT NULL CHECK(byte_count BETWEEN 0 AND 1000000),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(work_order_id,kind,task_key,version),
 CHECK((kind='sources' AND task_key='' AND version=0) OR (kind<>'sources' AND task_key<>'' AND version>0))
);
ALTER TABLE evidence_objects ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER immutable_evidence_objects BEFORE UPDATE OR DELETE ON evidence_objects FOR EACH ROW EXECUTE FUNCTION reject_verification_mutation();
REVOKE ALL ON evidence_objects FROM PUBLIC;
DO $guard$
DECLARE r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON evidence_objects FROM %I',r); END IF;
 END LOOP;
END;
$guard$;
COMMIT;
