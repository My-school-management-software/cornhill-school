-- Generate guardian PINs using cryptographically secure random bytes.
-- Rejection sampling avoids modulo bias across the 100,000,000 possible 8-digit PINs.
CREATE OR REPLACE FUNCTION public.admin_issue_guardian_pin(p_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_random bigint;
  v_pin text;
  v_recovery text := upper(encode(extensions.gen_random_bytes(6),'hex'));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  LOOP
    v_random := ('x' || encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint;
    EXIT WHEN v_random < 4200000000;
  END LOOP;
  v_pin := lpad((v_random % 100000000)::text,8,'0');

  UPDATE public.parent_guardian_contacts
  SET guardian_pin_hash=extensions.crypt(v_pin,extensions.gen_salt('bf',10)),
      guardian_recovery_hash=extensions.crypt(v_recovery,extensions.gen_salt('bf',10)),
      guardian_pin_issued_at=now(),
      guardian_pin_changed_at=null,
      guardian_pin_failed_attempts=0,
      guardian_pin_locked_until=null
  WHERE id=p_contact_id AND is_active=true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active guardian contact not found';
  END IF;

  INSERT INTO public.guardian_pin_audit(contact_id,action,actor_user_id)
  VALUES(p_contact_id,'issued',auth.uid());

  RETURN jsonb_build_object('pin',v_pin,'recovery_code',v_recovery,'issued_at',now());
END;
$function$;
