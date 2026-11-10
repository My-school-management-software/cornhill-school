-- Atomically bind Parent Portal session creation to the current PIN policy and guardian identity.
-- A shared lock on the policy row serializes session creation against the Admin ON/OFF update.
-- Contact and learner row locks also serialize issuance against contact deactivation and archiving.

CREATE OR REPLACE FUNCTION public.parent_portal_create_session(
  p_token_hash text,
  p_guardian_contact_id uuid,
  p_student_id uuid,
  p_registered_phone text,
  p_user_agent_hash text,
  p_pin text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_pin_required boolean;
  v_contact_student_id uuid;
  v_contact_phone text;
  v_contact_active boolean;
  v_guardian_pin_hash text;
  v_student_status text;
  v_now timestamptz := now();
  v_expires_at timestamptz := v_now + interval '12 hours';
BEGIN
  IF coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$'
     OR p_guardian_contact_id IS NULL
     OR p_student_id IS NULL
     OR coalesce(p_registered_phone, '') !~ '^\+256[0-9]{9}
     OR coalesce(p_user_agent_hash, '') !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_request');
  END IF;

  -- This lock conflicts with the administrator's FOR UPDATE lock in the setting RPC.
  SELECT s.guardian_pin_required
    INTO v_pin_required
  FROM private.parent_portal_security_settings s
  WHERE s.id = true
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'settings_unavailable');
  END IF;

  -- Recheck the exact guardian identity and serialize against contact edits/deactivation.
  SELECT c.student_id, c.phone_e164, c.is_active, c.guardian_pin_hash
    INTO v_contact_student_id, v_contact_phone, v_contact_active, v_guardian_pin_hash
  FROM public.parent_guardian_contacts c
  WHERE c.id = p_guardian_contact_id
  FOR SHARE OF c;

  IF NOT FOUND
     OR v_contact_student_id IS DISTINCT FROM p_student_id
     OR v_contact_phone IS DISTINCT FROM p_registered_phone
     OR v_contact_active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'code', 'guardian_contact_changed');
  END IF;

  -- Prevent a sign-in already in flight from recreating a session after learner archiving.
  SELECT s.status
    INTO v_student_status
  FROM public.students s
  WHERE s.id = p_student_id
  FOR SHARE OF s;

  IF NOT FOUND OR v_student_status = 'Archived' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'learner_unavailable');
  END IF;

  -- Revalidate the PIN under the contact row lock. This also prevents an old PIN
  -- verified just before a reset from issuing a fresh session after that reset.
  IF v_pin_required THEN
    IF coalesce(p_pin, '') !~ '^[0-9]{8}$'
       OR v_guardian_pin_hash IS NULL
       OR extensions.crypt(p_pin, v_guardian_pin_hash) IS DISTINCT FROM v_guardian_pin_hash THEN
      RETURN jsonb_build_object('ok', false, 'code', 'guardian_pin_required');
    END IF;
  END IF;

  INSERT INTO public.parent_portal_sessions(
    token_hash, guardian_contact_id, student_id, expires_at, user_agent_hash
  ) VALUES (
    p_token_hash, p_guardian_contact_id, p_student_id, v_expires_at, p_user_agent_hash
  );

  RETURN jsonb_build_object('ok', true, 'expires_at', v_expires_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.parent_portal_create_session(text, uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.parent_portal_create_session(text, uuid, uuid, text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.parent_portal_create_session(text, uuid, uuid, text, text, text)
  IS 'Service-role-only atomic Parent Portal session creation. Locks current PIN policy, guardian contact and learner identity before issuing a 12-hour session.';

     OR coalesce(p_user_agent_hash, '') !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_request');
  END IF;

  -- This lock conflicts with the administrator's FOR UPDATE lock in the setting RPC.
  SELECT s.guardian_pin_required
    INTO v_pin_required
  FROM private.parent_portal_security_settings s
  WHERE s.id = true
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'settings_unavailable');
  END IF;

  -- Recheck the exact guardian identity and serialize against contact edits/deactivation.
  SELECT c.student_id, c.phone_e164, c.is_active, c.guardian_pin_hash
    INTO v_contact_student_id, v_contact_phone, v_contact_active, v_guardian_pin_hash
  FROM public.parent_guardian_contacts c
  WHERE c.id = p_guardian_contact_id
  FOR SHARE OF c;

  IF NOT FOUND
     OR v_contact_student_id IS DISTINCT FROM p_student_id
     OR v_contact_phone IS DISTINCT FROM p_registered_phone
     OR v_contact_active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'code', 'guardian_contact_changed');
  END IF;

  -- Prevent a sign-in already in flight from recreating a session after learner archiving.
  SELECT s.status
    INTO v_student_status
  FROM public.students s
  WHERE s.id = p_student_id
  FOR SHARE OF s;

  IF NOT FOUND OR v_student_status = 'Archived' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'learner_unavailable');
  END IF;

  -- Revalidate the PIN under the contact row lock. This also prevents an old PIN
  -- verified just before a reset from issuing a fresh session after that reset.
  IF v_pin_required THEN
    IF coalesce(p_pin, '') !~ '^[0-9]{8}$'
       OR v_guardian_pin_hash IS NULL
       OR extensions.crypt(p_pin, v_guardian_pin_hash) IS DISTINCT FROM v_guardian_pin_hash THEN
      RETURN jsonb_build_object('ok', false, 'code', 'guardian_pin_required');
    END IF;
  END IF;

  INSERT INTO public.parent_portal_sessions(
    token_hash, guardian_contact_id, student_id, expires_at, user_agent_hash
  ) VALUES (
    p_token_hash, p_guardian_contact_id, p_student_id, v_expires_at, p_user_agent_hash
  );

  RETURN jsonb_build_object('ok', true, 'expires_at', v_expires_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.parent_portal_create_session(text, uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.parent_portal_create_session(text, uuid, uuid, text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.parent_portal_create_session(text, uuid, uuid, text, text, text)
  IS 'Service-role-only atomic Parent Portal session creation. Locks current PIN policy, guardian contact and learner identity before issuing a 12-hour session.';
