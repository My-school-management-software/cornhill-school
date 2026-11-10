-- Temporarily allow Parent Portal authentication using the registered guardian phone + PIN.
-- The permanent pupil code remains in learner records and is shown inside the portal,
-- but is not required at sign-in until the school explicitly re-enables it.
-- Existing code-based RPCs are retained for the planned future reactivation.

CREATE OR REPLACE FUNCTION public.parent_portal_get_learner_with_pin_by_phone(
  p_registered_phone text,
  p_pin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_phone text := nullif(trim(p_registered_phone),'');
  v_contact_id uuid;
  v_pupil_code text;
  v_candidate_count integer;
  v_match_count integer;
  v_result jsonb;
BEGIN
  IF v_phone IS NULL OR coalesce(p_pin,'') !~ '^[0-9]{8}$' THEN
    RETURN jsonb_build_object('error','Enter the registered guardian phone number and 8-digit PIN');
  END IF;

  SELECT count(*) INTO v_candidate_count
  FROM public.parent_guardian_contacts c
  JOIN public.students s ON s.id=c.student_id
  WHERE c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived';

  IF v_candidate_count=0 THEN
    RETURN jsonb_build_object('error','Guardian verification failed');
  END IF;

  IF v_candidate_count=1 THEN
    SELECT c.id,s.admission_number INTO v_contact_id,v_pupil_code
    FROM public.parent_guardian_contacts c
    JOIN public.students s ON s.id=c.student_id
    WHERE c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived'
    LIMIT 1;
  ELSE
    SELECT count(*) INTO v_match_count
    FROM public.parent_guardian_contacts c
    JOIN public.students s ON s.id=c.student_id
    WHERE c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived'
      AND c.guardian_pin_hash IS NOT NULL
      AND extensions.crypt(p_pin,c.guardian_pin_hash)=c.guardian_pin_hash;

    IF v_match_count<>1 THEN
      UPDATE public.parent_guardian_contacts c
      SET guardian_pin_failed_attempts=coalesce(c.guardian_pin_failed_attempts,0)+1,
          guardian_pin_locked_until=CASE
            WHEN coalesce(c.guardian_pin_failed_attempts,0)+1>=5 THEN now()+interval '30 minutes'
            ELSE c.guardian_pin_locked_until END
      FROM public.students s
      WHERE s.id=c.student_id AND c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived'
        AND (c.guardian_pin_locked_until IS NULL OR c.guardian_pin_locked_until<=now());
      INSERT INTO public.guardian_pin_audit(contact_id,action)
      SELECT c.id,CASE WHEN coalesce(c.guardian_pin_failed_attempts,0)>=5 THEN 'locked' ELSE 'failed_attempt' END
      FROM public.parent_guardian_contacts c
      JOIN public.students s ON s.id=c.student_id
      WHERE c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived';
      RETURN jsonb_build_object('error','Guardian verification failed');
    END IF;

    SELECT c.id,s.admission_number INTO v_contact_id,v_pupil_code
    FROM public.parent_guardian_contacts c
    JOIN public.students s ON s.id=c.student_id
    WHERE c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived'
      AND c.guardian_pin_hash IS NOT NULL
      AND extensions.crypt(p_pin,c.guardian_pin_hash)=c.guardian_pin_hash
    LIMIT 1;
  END IF;

  IF v_contact_id IS NULL OR v_pupil_code IS NULL THEN
    RETURN jsonb_build_object('error','Guardian verification failed');
  END IF;

  -- Delegate PIN verification, lockout handling, audit, and learner-data assembly
  -- to the existing protected function so all current privacy rules remain intact.
  v_result := public.parent_portal_get_learner_with_pin(v_pupil_code,v_phone,p_pin);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.parent_reset_guardian_pin_by_phone(
  p_registered_phone text,
  p_recovery_code text,
  p_new_pin text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_phone text := nullif(trim(p_registered_phone),'');
  v_contact_id uuid;
  v_pupil_code text;
  v_candidate_count integer;
  v_match_count integer;
BEGIN
  IF v_phone IS NULL OR coalesce(p_recovery_code,'')='' OR coalesce(p_new_pin,'') !~ '^[0-9]{8}$' THEN
    RETURN false;
  END IF;
  SELECT count(*) INTO v_candidate_count
  FROM public.parent_guardian_contacts c JOIN public.students s ON s.id=c.student_id
  WHERE c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived';
  IF v_candidate_count=0 THEN RETURN false; END IF;

  IF v_candidate_count=1 THEN
    SELECT c.id,s.admission_number INTO v_contact_id,v_pupil_code
    FROM public.parent_guardian_contacts c JOIN public.students s ON s.id=c.student_id
    WHERE c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived' LIMIT 1;
  ELSE
    SELECT count(*) INTO v_match_count
    FROM public.parent_guardian_contacts c JOIN public.students s ON s.id=c.student_id
    WHERE c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived'
      AND c.guardian_recovery_hash IS NOT NULL
      AND extensions.crypt(upper(trim(p_recovery_code)),c.guardian_recovery_hash)=c.guardian_recovery_hash;
    IF v_match_count<>1 THEN RETURN false; END IF;
    SELECT c.id,s.admission_number INTO v_contact_id,v_pupil_code
    FROM public.parent_guardian_contacts c JOIN public.students s ON s.id=c.student_id
    WHERE c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived'
      AND c.guardian_recovery_hash IS NOT NULL
      AND extensions.crypt(upper(trim(p_recovery_code)),c.guardian_recovery_hash)=c.guardian_recovery_hash
    LIMIT 1;
  END IF;
  RETURN public.parent_reset_guardian_pin(v_pupil_code,v_phone,p_recovery_code,p_new_pin);
END;
$function$;

CREATE OR REPLACE FUNCTION public.parent_change_guardian_pin_by_phone(
  p_registered_phone text,
  p_current_pin text,
  p_new_pin text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_phone text := nullif(trim(p_registered_phone),'');
  v_contact_id uuid;
  v_pupil_code text;
  v_candidate_count integer;
  v_match_count integer;
BEGIN
  IF v_phone IS NULL OR coalesce(p_current_pin,'') !~ '^[0-9]{8}$' OR coalesce(p_new_pin,'') !~ '^[0-9]{8}$' THEN
    RETURN false;
  END IF;
  SELECT count(*) INTO v_candidate_count
  FROM public.parent_guardian_contacts c JOIN public.students s ON s.id=c.student_id
  WHERE c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived';
  IF v_candidate_count=0 THEN RETURN false; END IF;

  IF v_candidate_count=1 THEN
    SELECT c.id,s.admission_number INTO v_contact_id,v_pupil_code
    FROM public.parent_guardian_contacts c JOIN public.students s ON s.id=c.student_id
    WHERE c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived' LIMIT 1;
  ELSE
    SELECT count(*) INTO v_match_count
    FROM public.parent_guardian_contacts c JOIN public.students s ON s.id=c.student_id
    WHERE c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived'
      AND c.guardian_pin_hash IS NOT NULL
      AND extensions.crypt(p_current_pin,c.guardian_pin_hash)=c.guardian_pin_hash;
    IF v_match_count<>1 THEN RETURN false; END IF;
    SELECT c.id,s.admission_number INTO v_contact_id,v_pupil_code
    FROM public.parent_guardian_contacts c JOIN public.students s ON s.id=c.student_id
    WHERE c.phone_e164=v_phone AND c.is_active=true AND s.status<>'Archived'
      AND c.guardian_pin_hash IS NOT NULL
      AND extensions.crypt(p_current_pin,c.guardian_pin_hash)=c.guardian_pin_hash
    LIMIT 1;
  END IF;
  RETURN public.parent_change_guardian_pin(v_pupil_code,v_phone,p_current_pin,p_new_pin);
END;
$function$;

REVOKE ALL ON FUNCTION public.parent_portal_get_learner_with_pin_by_phone(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parent_reset_guardian_pin_by_phone(text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parent_change_guardian_pin_by_phone(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parent_portal_get_learner_with_pin_by_phone(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.parent_reset_guardian_pin_by_phone(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.parent_change_guardian_pin_by_phone(text,text,text) TO service_role;
