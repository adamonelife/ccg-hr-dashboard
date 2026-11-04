-- Stage 1 only. Deliberately contains no identity seeds, grants or login changes.
-- Prerequisites: existing People and Nallin platform tables; apply explicitly.
BEGIN;
CREATE TABLE platform.people_identity_bindings (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  organisation_id UUID NOT NULL,
  employee_id TEXT NOT NULL UNIQUE REFERENCES public.employees(employee_id) ON DELETE RESTRICT,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','revoked')),
  binding_version BIGINT NOT NULL DEFAULT 1 CHECK (binding_version > 0),
  approval_reference TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (organisation_id, auth_user_id)
    REFERENCES platform.memberships(organisation_id,user_id) ON DELETE RESTRICT,
  CHECK (review_status <> 'approved' OR
    (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND length(btrim(approval_reference)) > 0 AND approval_reference IS NOT NULL))
);
CREATE TABLE platform.people_binding_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_user_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('INSERT','UPDATE')),
  previous_record JSONB,
  current_record JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX people_binding_audit_subject_idx ON platform.people_binding_audit(auth_user_id,id);
ALTER TABLE platform.people_identity_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.people_binding_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform.people_identity_bindings, platform.people_binding_audit FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON platform.people_identity_bindings, platform.people_binding_audit FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON platform.people_identity_bindings, platform.people_binding_audit FROM authenticated;
  END IF;
END $$;
-- Invoker rights: no privilege-escalating SECURITY DEFINER function.
CREATE FUNCTION platform.audit_people_binding_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'People identity bindings must be revoked, not deleted';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
      OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
      OR NEW.organisation_id IS DISTINCT FROM OLD.organisation_id THEN
      RAISE EXCEPTION 'People binding identity keys are immutable; replacement requires explicit review';
    END IF;
    NEW.binding_version := OLD.binding_version + 1;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  ELSE
    NEW.binding_version := 1;
  END IF;
  INSERT INTO platform.people_binding_audit(auth_user_id,actor_user_id,event,previous_record,current_record)
    VALUES (NEW.auth_user_id,NEW.changed_by,TG_OP,
      CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform.audit_people_binding_change() FROM PUBLIC;
CREATE TRIGGER people_binding_change BEFORE INSERT OR UPDATE OR DELETE
ON platform.people_identity_bindings FOR EACH ROW EXECUTE FUNCTION platform.audit_people_binding_change();
COMMIT;
