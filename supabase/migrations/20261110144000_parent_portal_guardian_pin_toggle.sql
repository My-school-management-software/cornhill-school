-- Administrator-controlled Parent Portal Guardian PIN requirement.
-- Default OFF: learner pupil code + registered guardian phone are sufficient.
-- When ON: the learner pupil code, registered phone and Guardian PIN are required.
-- This is independent of staff / administrator authentication.

CREATE TABLE IF NOT EXISTS private.parent_portal_security_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  guardian_pin_required boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO private.parent_portal_security_settings(id, guardian_pin_required)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS private.parent_portal_security_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_guardian_pin_required boolean NOT NULL,
  new_guardian_pin_required boolean NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.parent_portal_security_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.parent_portal_security_settings_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.parent_portal_security_settings FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.parent_portal_security_settings_audit FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_parent_portal_security_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_settings private.parent_portal_security_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT * INTO v_settings
  FROM private.parent_portal_security_settings
  WHERE id = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('guardian_pin_required', false, 'updated_at', NULL);
  END IF;

  RETURN jsonb_build_object(
    'guardian_pin_required', v_settings.guardian_pin_required,
    'updated_at', v_settings.updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_parent_portal_guardian_pin_required(
  p_required boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old_required boolean;
  v_updated_at timestamptz := now();
  v_revoked_sessions integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF p_required IS NULL THEN
    RAISE EXCEPTION 'Choose whether Guardian PIN is required';
  END IF;

  INSERT INTO private.parent_portal_security_settings(id, guardian_pin_required, updated_at, updated_by)
  VALUES (true, false, v_updated_at, auth.uid())
  ON CONFLICT (id) DO NOTHING;

  SELECT guardian_pin_required INTO v_old_required
  FROM private.parent_portal_security_settings
  WHERE id = true
  FOR UPDATE;

  UPDATE private.parent_portal_security_settings
  SET guardian_pin_required = p_required,
      updated_at = v_updated_at,
      updated_by = auth.uid()
  WHERE id = true;

  IF v_old_required IS DISTINCT FROM p_required THEN
    INSERT INTO private.parent_portal_security_settings_audit(
      old_guardian_pin_required, new_guardian_pin_required, actor_user_id
    ) VALUES (v_old_required, p_required, auth.uid());
  END IF;

  -- Enabling a stronger sign-in factor invalidates existing parent sessions,
  -- so no session created without the required PIN remains active.
  IF p_required = true AND v_old_required = false THEN
    UPDATE public.parent_portal_sessions
    SET revoked_at = v_updated_at
    WHERE revoked_at IS NULL
      AND expires_at > v_updated_at;
    GET DIAGNOSTICS v_revoked_sessions = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'guardian_pin_required', p_required,
    'updated_at', v_updated_at,
    'revoked_sessions', v_revoked_sessions
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.parent_portal_guardian_pin_required()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(
    (SELECT s.guardian_pin_required
     FROM private.parent_portal_security_settings s
     WHERE s.id = true),
    false
  );
$function$;

REVOKE ALL ON FUNCTION public.admin_get_parent_portal_security_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_parent_portal_guardian_pin_required(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.parent_portal_guardian_pin_required() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_parent_portal_security_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_parent_portal_guardian_pin_required(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_portal_guardian_pin_required() TO service_role;
