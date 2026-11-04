BEGIN;
-- Preserve immutable history while allowing the existing Administrator DELETE workflow.
ALTER TABLE platform.people_identity_bindings ADD COLUMN original_employee_id TEXT;
UPDATE platform.people_identity_bindings SET original_employee_id=employee_id;
ALTER TABLE platform.people_identity_bindings ALTER COLUMN original_employee_id SET NOT NULL;
ALTER TABLE platform.people_identity_bindings ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE platform.people_identity_bindings ADD COLUMN managed_legacy BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE platform.people_identity_bindings ADD COLUMN detached_reason TEXT;
ALTER TABLE platform.people_identity_bindings ADD CONSTRAINT people_binding_detached_check
 CHECK (employee_id IS NOT NULL OR (review_status='revoked' AND detached_reason='employee_deleted'));
ALTER TABLE platform.people_binding_audit ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE platform.people_binding_audit ADD COLUMN actor_context JSONB;
CREATE TABLE platform.people_handoff_requests (
 id TEXT PRIMARY KEY, browser_nonce_hash TEXT NOT NULL, environment TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, code_hash TEXT UNIQUE,
 auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
 binding_version BIGINT, encrypted_token TEXT, provider_session_id UUID,
 token_expires_at TIMESTAMPTZ, consumed_at TIMESTAMPTZ
);
CREATE TABLE platform.people_auth_contexts (
 id TEXT PRIMARY KEY, auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 employee_id TEXT NOT NULL, organisation_id UUID NOT NULL, binding_version BIGINT NOT NULL,
 provider_session_id UUID NOT NULL, environment TEXT NOT NULL, encrypted_token TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ
);
CREATE INDEX people_context_subject_idx ON platform.people_auth_contexts(auth_user_id);
CREATE INDEX people_handoff_expiry_idx ON platform.people_handoff_requests(expires_at);
CREATE INDEX people_context_expiry_idx ON platform.people_auth_contexts(expires_at);
ALTER TABLE platform.people_handoff_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.people_auth_contexts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform.people_handoff_requests,platform.people_auth_contexts FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON platform.people_handoff_requests,platform.people_auth_contexts FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON platform.people_handoff_requests,platform.people_auth_contexts FROM authenticated;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION platform.audit_people_binding_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE detached BOOLEAN; actor JSONB;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'People identity bindings must be revoked, not deleted'; END IF;
 detached := TG_OP='UPDATE' AND OLD.employee_id IS NOT NULL AND NEW.employee_id IS NULL
   AND NEW.review_status='revoked' AND NEW.detached_reason='employee_deleted' AND pg_trigger_depth()>1;
 IF TG_OP='UPDATE' THEN
  IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id OR NEW.organisation_id IS DISTINCT FROM OLD.organisation_id
    OR NEW.original_employee_id IS DISTINCT FROM OLD.original_employee_id
    OR (NEW.employee_id IS DISTINCT FROM OLD.employee_id AND NOT detached) THEN
    RAISE EXCEPTION 'People binding identity keys are immutable';
  END IF;
  NEW.binding_version:=OLD.binding_version+1; NEW.created_at:=OLD.created_at; NEW.updated_at:=now();
  UPDATE platform.people_auth_contexts SET revoked_at=now() WHERE auth_user_id=OLD.auth_user_id AND revoked_at IS NULL;
 ELSE NEW.binding_version:=1; NEW.original_employee_id:=NEW.employee_id;
 END IF;
 actor:=CASE WHEN detached THEN coalesce(nullif(current_setting('nallin.people_actor',true),''),'{}')::jsonb ELSE NULL END;
 INSERT INTO platform.people_binding_audit(auth_user_id,actor_user_id,event,previous_record,current_record,actor_context)
 VALUES(NEW.auth_user_id,CASE WHEN detached THEN NULL ELSE NEW.changed_by END,TG_OP,
 CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW),actor);
 RETURN NEW;
END $$;
CREATE FUNCTION platform.detach_deleted_people_employee() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 UPDATE platform.people_identity_bindings SET employee_id=NULL,review_status='revoked',detached_reason='employee_deleted'
 WHERE employee_id=OLD.employee_id;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION platform.detach_deleted_people_employee() FROM PUBLIC;
CREATE TRIGGER detach_people_binding BEFORE DELETE ON public.employees
FOR EACH ROW EXECUTE FUNCTION platform.detach_deleted_people_employee();
COMMIT;
