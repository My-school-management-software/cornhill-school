-- CORNHILL Director-controlled staff account and role permission administration.
-- SECURITY DEFINER functions validate the acting Director inside PostgreSQL.
-- Application runtime receives EXECUTE only; direct role-table writes stay revoked.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_auth.assert_director_role_manager(p_actor_staff_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cornhill_auth
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cornhill_auth.staff_accounts a
    JOIN cornhill_auth.staff_role_assignments ra
      ON ra.staff_account_id = a.id AND ra.role_code = 'director'
    JOIN cornhill_auth.staff_role_permissions rp
      ON rp.role_code = ra.role_code AND rp.permission_code = 'system.roles_manage'
    WHERE a.id = p_actor_staff_id AND a.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only an active Director with system.roles_manage may administer staff accounts and role grants'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION cornhill_auth.set_staff_role_permissions(
  p_actor_staff_id uuid,
  p_role_code text,
  p_permission_codes text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cornhill_auth
AS $function$
DECLARE
  old_permissions text[];
  new_permissions text[];
  unknown_count integer;
BEGIN
  PERFORM cornhill_auth.assert_director_role_manager(p_actor_staff_id);

  IF p_role_code IS NULL OR p_role_code = 'director' THEN
    RAISE EXCEPTION 'The Director role is protected and cannot be edited through role administration'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM cornhill_auth.staff_roles
  WHERE role_code = p_role_code AND is_assignable = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected staff role does not exist or cannot be assigned'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF p_permission_codes IS NULL OR cardinality(p_permission_codes) > 50 THEN
    RAISE EXCEPTION 'A valid permission list of at most 50 entries is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF cardinality(p_permission_codes) <>
     (SELECT count(DISTINCT code) FROM unnest(p_permission_codes) AS valueset(code)) THEN
    RAISE EXCEPTION 'Duplicate permission codes are not allowed'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO unknown_count
  FROM unnest(p_permission_codes) AS requested(code)
  LEFT JOIN cornhill_auth.permission_catalog pc ON pc.permission_code = requested.code
  WHERE pc.permission_code IS NULL
     OR requested.code IN ('system.roles_manage', 'system.backups_manage');
  IF unknown_count > 0 THEN
    RAISE EXCEPTION 'Unknown or Director-reserved permissions cannot be assigned to another role'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(array_agg(permission_code ORDER BY permission_code), ARRAY[]::text[])
    INTO old_permissions
  FROM cornhill_auth.staff_role_permissions
  WHERE role_code = p_role_code;

  DELETE FROM cornhill_auth.staff_role_permissions WHERE role_code = p_role_code;
  INSERT INTO cornhill_auth.staff_role_permissions (role_code, permission_code, granted_by_staff_id)
  SELECT p_role_code, requested.code, p_actor_staff_id
  FROM unnest(p_permission_codes) AS requested(code);

  SELECT COALESCE(array_agg(permission_code ORDER BY permission_code), ARRAY[]::text[])
    INTO new_permissions
  FROM cornhill_auth.staff_role_permissions
  WHERE role_code = p_role_code;

  INSERT INTO cornhill_auth.security_audit_events
    (actor_type, actor_id, event_code, target_type, outcome, details)
  VALUES (
    'staff', p_actor_staff_id, 'security.role_permissions_changed',
    'staff_role', 'success',
    jsonb_build_object('roleCode', p_role_code,
      'beforePermissionCodes', old_permissions,
      'afterPermissionCodes', new_permissions)
  );

  RETURN jsonb_build_object(
    'roleCode', p_role_code,
    'permissionCodes', to_jsonb(new_permissions),
    'permissionCount', cardinality(new_permissions)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION cornhill_auth.create_staff_account(
  p_actor_staff_id uuid,
  p_username text,
  p_email text,
  p_password_hash text,
  p_staff_number text,
  p_legal_name text,
  p_preferred_name text,
  p_job_title text,
  p_department text,
  p_phone_e164 text,
  p_role_code text,
  p_hired_on date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cornhill_auth, cornhill_school
AS $function$
DECLARE
  new_staff_id uuid;
  new_email text;
BEGIN
  PERFORM cornhill_auth.assert_director_role_manager(p_actor_staff_id);

  IF p_username IS NULL OR length(trim(p_username)) NOT BETWEEN 3 AND 64
     OR p_username !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$' THEN
    RAISE EXCEPTION 'Username must contain 3 to 64 letters, numbers, dots, underscores or hyphens'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_password_hash IS NULL OR p_password_hash NOT LIKE '$argon2id$%' THEN
    RAISE EXCEPTION 'A valid Argon2id password hash is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_staff_number IS NULL OR p_staff_number !~ '^[A-Z0-9_-]{2,30}$' THEN
    RAISE EXCEPTION 'Staff number format is invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_legal_name IS NULL OR length(trim(p_legal_name)) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Staff legal name is invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_job_title IS NULL OR length(trim(p_job_title)) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Staff job title is invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_email IS NOT NULL AND length(trim(p_email)) > 254 THEN
    RAISE EXCEPTION 'Staff email address is too long'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_phone_e164 IS NOT NULL AND p_phone_e164 !~ '^\+256[0-9]{9}$' THEN
    RAISE EXCEPTION 'Staff phone must use the Uganda +256 format'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_hired_on IS NULL THEN
    RAISE EXCEPTION 'A staff hire date is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_role_code IS NULL OR p_role_code = 'director' OR NOT EXISTS (
    SELECT 1 FROM cornhill_auth.staff_roles
    WHERE role_code = p_role_code AND is_assignable = true
  ) THEN
    RAISE EXCEPTION 'Select an assignable staff role; Director accounts can only be bootstrapped separately'
      USING ERRCODE = 'check_violation';
  END IF;

  new_email := NULLIF(lower(trim(p_email)), '');
  INSERT INTO cornhill_auth.staff_accounts
    (username, username_normalized, email, email_normalized, password_hash,
     account_status, must_change_password, password_changed_at)
  VALUES
    (trim(p_username), lower(trim(p_username)), new_email, new_email, p_password_hash,
     'active', false, now())
  RETURNING id INTO new_staff_id;

  INSERT INTO cornhill_school.staff_profiles
    (staff_account_id, staff_number, legal_name, preferred_name, job_title,
     department, phone_e164, email, employment_status, hired_on)
  VALUES
    (new_staff_id, trim(p_staff_number), trim(p_legal_name),
     NULLIF(trim(p_preferred_name), ''), trim(p_job_title),
     NULLIF(trim(p_department), ''), NULLIF(trim(p_phone_e164), ''),
     new_email, 'Active', p_hired_on);

  INSERT INTO cornhill_auth.staff_role_assignments
    (staff_account_id, role_code, assigned_by)
  VALUES (new_staff_id, p_role_code, p_actor_staff_id);

  INSERT INTO cornhill_auth.security_audit_events
    (actor_type, actor_id, event_code, target_type, target_id, outcome, details)
  VALUES (
    'staff', p_actor_staff_id, 'security.staff_account_created',
    'staff_account', new_staff_id, 'success',
    jsonb_build_object('username', lower(trim(p_username)),
      'staffNumber', trim(p_staff_number), 'roleCode', p_role_code)
  );

  RETURN jsonb_build_object(
    'staffAccountId', new_staff_id,
    'username', trim(p_username),
    'staffNumber', trim(p_staff_number),
    'roleCode', p_role_code,
    'accountStatus', 'active'
  );
END;
$function$;

REVOKE ALL ON FUNCTION cornhill_auth.assert_director_role_manager(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_auth.set_staff_role_permissions(uuid, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_auth.create_staff_account(uuid, text, text, text, text, text, text, text, text, text, text, date) FROM PUBLIC;
GRANT USAGE ON SCHEMA cornhill_auth TO cornhill_auth_runtime;
GRANT EXECUTE ON FUNCTION cornhill_auth.set_staff_role_permissions(uuid, text, text[]) TO cornhill_auth_runtime;
GRANT EXECUTE ON FUNCTION cornhill_auth.create_staff_account(uuid, text, text, text, text, text, text, text, text, text, text, date) TO cornhill_auth_runtime;

COMMIT;
