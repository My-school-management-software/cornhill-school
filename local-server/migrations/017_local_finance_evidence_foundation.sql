-- CORNHILL local private evidence workflow foundation.
-- Metadata only: file bytes remain in the private filesystem store outside the repository.
-- Additive migration for the isolated local PostgreSQL database only.

BEGIN;

INSERT INTO cornhill_auth.permission_catalog(permission_code,category,description,high_risk)
VALUES
 ('finance.evidence_manage','finance','Create evidence requests and upload assigned evidence files.',true),
 ('finance.evidence_review','finance','Review and decide submitted financial evidence independently.',true)
ON CONFLICT(permission_code) DO NOTHING;

CREATE TABLE cornhill_school.evidence_capture_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assigned_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    requested_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    purpose text NOT NULL CHECK (purpose IN ('Bank deposit slip','Expense receipt','Withdrawal evidence','Other')),
    context_type text NOT NULL DEFAULT 'other' CHECK (context_type IN ('expense_request','bank_transaction','other')),
    context_record_id uuid,
    context_label text NOT NULL CHECK (length(btrim(context_label)) BETWEEN 2 AND 180),
    amount_ugx bigint CHECK (amount_ugx IS NULL OR amount_ugx > 0),
    status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Submitted','Approved','Rejected','Cancelled')),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
    submitted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((status='Submitted' AND submitted_at IS NOT NULL) OR status<>'Submitted'),
    CHECK ((context_type='other' AND context_record_id IS NULL) OR
           (context_type<>'other' AND context_record_id IS NOT NULL))
);

CREATE INDEX evidence_capture_requests_assigned_status_idx
    ON cornhill_school.evidence_capture_requests(assigned_staff_id,status,expires_at);
CREATE INDEX evidence_capture_requests_requester_created_idx
    ON cornhill_school.evidence_capture_requests(requested_by_staff_id,created_at DESC);

CREATE TABLE cornhill_school.evidence_capture_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES cornhill_school.evidence_capture_requests(id) ON DELETE RESTRICT,
    storage_object_key uuid NOT NULL UNIQUE,
    sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
    size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 15728640),
    original_file_name text NOT NULL CHECK (length(btrim(original_file_name)) BETWEEN 1 AND 160),
    uploaded_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evidence_capture_files_request_idx
    ON cornhill_school.evidence_capture_files(request_id,uploaded_at);

CREATE TABLE cornhill_school.evidence_capture_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES cornhill_school.evidence_capture_requests(id) ON DELETE RESTRICT,
    reviewed_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    action text NOT NULL CHECK (action IN ('Approved','Rejected','Needs clearer photo')),
    review_note text CHECK (review_note IS NULL OR length(review_note)<=500),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evidence_capture_reviews_request_idx
    ON cornhill_school.evidence_capture_reviews(request_id,created_at DESC);

CREATE TABLE cornhill_school.evidence_capture_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES cornhill_school.evidence_capture_requests(id) ON DELETE RESTRICT,
    actor_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    event_code text NOT NULL CHECK (event_code IN (
      'evidence.requested','evidence.file_uploaded','evidence.submitted',
      'evidence.approved','evidence.rejected','evidence.reupload_requested','evidence.cancelled'
    )),
    details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evidence_capture_events_request_idx
    ON cornhill_school.evidence_capture_events(request_id,occurred_at DESC);

CREATE OR REPLACE FUNCTION cornhill_school.prevent_evidence_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION 'Evidence files, reviews and event history are append-only' USING ERRCODE='55000';
END $fn$;
REVOKE ALL ON FUNCTION cornhill_school.prevent_evidence_history_mutation() FROM PUBLIC;
CREATE TRIGGER evidence_capture_files_immutable
BEFORE UPDATE OR DELETE ON cornhill_school.evidence_capture_files
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_evidence_history_mutation();
CREATE TRIGGER evidence_capture_reviews_immutable
BEFORE UPDATE OR DELETE ON cornhill_school.evidence_capture_reviews
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_evidence_history_mutation();
CREATE TRIGGER evidence_capture_events_immutable
BEFORE UPDATE OR DELETE ON cornhill_school.evidence_capture_events
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_evidence_history_mutation();

CREATE OR REPLACE FUNCTION cornhill_school.create_local_evidence_request(
    p_actor_staff_id uuid,
    p_assigned_staff_id uuid,
    p_purpose text,
    p_context_type text DEFAULT 'other',
    p_context_record_id uuid DEFAULT NULL,
    p_context_label text DEFAULT 'Supporting evidence',
    p_amount_ugx bigint DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_request_id uuid;
BEGIN
  IF p_actor_staff_id IS NULL OR p_assigned_staff_id IS NULL OR
     p_purpose NOT IN ('Bank deposit slip','Expense receipt','Withdrawal evidence','Other') OR
     p_context_type NOT IN ('expense_request','bank_transaction','other') OR
     length(btrim(coalesce(p_context_label,''))) NOT BETWEEN 2 AND 180 OR
     (p_amount_ugx IS NOT NULL AND p_amount_ugx<=0) OR
     ((p_context_type='other')<>(p_context_record_id IS NULL)) THEN
    RAISE EXCEPTION 'Evidence request details are invalid' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cornhill_auth.staff_accounts sa
    JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id=sa.id
    JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code=ra.role_code
    JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
    WHERE sa.id=p_actor_staff_id AND sa.account_status='active'
      AND sp.employment_status='Active' AND rp.permission_code='finance.evidence_manage'
  ) THEN RAISE EXCEPTION 'Staff account lacks permission to manage financial evidence' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cornhill_auth.staff_accounts sa
    JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
    WHERE sa.id=p_assigned_staff_id AND sa.account_status='active' AND sp.employment_status='Active'
  ) THEN RAISE EXCEPTION 'Evidence must be assigned to an active staff account' USING ERRCODE='42501'; END IF;

  INSERT INTO cornhill_school.evidence_capture_requests(
    assigned_staff_id,requested_by_staff_id,purpose,context_type,context_record_id,
    context_label,amount_ugx
  ) VALUES (
    p_assigned_staff_id,p_actor_staff_id,p_purpose,p_context_type,p_context_record_id,
    btrim(p_context_label),p_amount_ugx
  ) RETURNING id INTO v_request_id;

  INSERT INTO cornhill_school.evidence_capture_events(request_id,actor_staff_id,event_code,details)
  VALUES(v_request_id,p_actor_staff_id,'evidence.requested',
    jsonb_build_object('purpose',p_purpose,'assigned_staff_id',p_assigned_staff_id));
  RETURN v_request_id;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.register_local_evidence_file(
    p_actor_staff_id uuid,p_request_id uuid,p_storage_object_key uuid,p_sha256 text,
    p_content_type text,p_size_bytes bigint,p_original_file_name text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_request cornhill_school.evidence_capture_requests%ROWTYPE; v_file_id uuid;
BEGIN
  IF p_actor_staff_id IS NULL OR p_request_id IS NULL OR p_storage_object_key IS NULL OR
     p_sha256 !~ '^[0-9a-f]{64}$' OR
     p_content_type NOT IN ('image/jpeg','image/png','image/webp','application/pdf') OR
     p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND 15728640 OR
     length(btrim(coalesce(p_original_file_name,''))) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Evidence file metadata is invalid' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cornhill_auth.staff_accounts sa
    JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id=sa.id
    JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code=ra.role_code
    JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
    WHERE sa.id=p_actor_staff_id AND sa.account_status='active'
      AND sp.employment_status='Active' AND rp.permission_code='finance.evidence_manage'
  ) THEN RAISE EXCEPTION 'Staff account lacks permission to upload financial evidence' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_request FROM cornhill_school.evidence_capture_requests
  WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.assigned_staff_id<>p_actor_staff_id OR
     v_request.status<>'Pending' OR v_request.expires_at<=now() THEN
    RAISE EXCEPTION 'Evidence request is not assigned to this staff member or has expired' USING ERRCODE='42501';
  END IF;
  INSERT INTO cornhill_school.evidence_capture_files(
    request_id,storage_object_key,sha256,content_type,size_bytes,original_file_name,uploaded_by_staff_id
  ) VALUES (
    p_request_id,p_storage_object_key,p_sha256,p_content_type,p_size_bytes,btrim(p_original_file_name),p_actor_staff_id
  ) RETURNING id INTO v_file_id;
  INSERT INTO cornhill_school.evidence_capture_events(request_id,actor_staff_id,event_code,details)
  VALUES(p_request_id,p_actor_staff_id,'evidence.file_uploaded',
    jsonb_build_object('file_id',v_file_id,'sha256',p_sha256,'size_bytes',p_size_bytes));
  RETURN v_file_id;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.submit_local_evidence_request(
    p_actor_staff_id uuid,p_request_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_request cornhill_school.evidence_capture_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM cornhill_school.evidence_capture_requests
  WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.assigned_staff_id<>p_actor_staff_id OR
     v_request.status<>'Pending' OR v_request.expires_at<=now() OR
     NOT EXISTS(SELECT 1 FROM cornhill_school.evidence_capture_files f WHERE f.request_id=p_request_id) THEN
    RAISE EXCEPTION 'Evidence request cannot be submitted until valid evidence is uploaded' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cornhill_auth.staff_accounts sa
    JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id=sa.id
    JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code=ra.role_code
    JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
    WHERE sa.id=p_actor_staff_id AND sa.account_status='active'
      AND sp.employment_status='Active' AND rp.permission_code='finance.evidence_manage'
  ) THEN RAISE EXCEPTION 'Staff account lacks permission to submit financial evidence' USING ERRCODE='42501'; END IF;
  UPDATE cornhill_school.evidence_capture_requests
  SET status='Submitted',submitted_at=now(),updated_at=now()
  WHERE id=p_request_id;
  INSERT INTO cornhill_school.evidence_capture_events(request_id,actor_staff_id,event_code)
  VALUES(p_request_id,p_actor_staff_id,'evidence.submitted');
  RETURN p_request_id;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.review_local_evidence_request(
    p_actor_staff_id uuid,p_request_id uuid,p_action text,p_note text DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_request cornhill_school.evidence_capture_requests%ROWTYPE; v_next_status text;
BEGIN
  IF p_action NOT IN ('Approved','Rejected','Needs clearer photo') OR
     (p_note IS NOT NULL AND length(p_note)>500) THEN
    RAISE EXCEPTION 'Evidence review decision is invalid' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cornhill_auth.staff_accounts sa
    JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id=sa.id
    JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code=ra.role_code
    JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
    WHERE sa.id=p_actor_staff_id AND sa.account_status='active'
      AND sp.employment_status='Active' AND rp.permission_code='finance.evidence_review'
  ) THEN RAISE EXCEPTION 'Staff account lacks permission to review financial evidence' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_request FROM cornhill_school.evidence_capture_requests
  WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.status<>'Submitted' THEN
    RAISE EXCEPTION 'Only submitted evidence can be reviewed' USING ERRCODE='23514';
  END IF;
  IF v_request.requested_by_staff_id=p_actor_staff_id OR EXISTS(
    SELECT 1 FROM cornhill_school.evidence_capture_files f
    WHERE f.request_id=p_request_id AND f.uploaded_by_staff_id=p_actor_staff_id
  ) THEN
    RAISE EXCEPTION 'The requester and evidence uploader cannot approve their own evidence' USING ERRCODE='42501';
  END IF;

  v_next_status:=CASE p_action WHEN 'Approved' THEN 'Approved'
    WHEN 'Rejected' THEN 'Rejected' ELSE 'Pending' END;
  INSERT INTO cornhill_school.evidence_capture_reviews(request_id,reviewed_by_staff_id,action,review_note)
  VALUES(p_request_id,p_actor_staff_id,p_action,nullif(btrim(coalesce(p_note,'')),'')); 
  UPDATE cornhill_school.evidence_capture_requests
  SET status=v_next_status,
      submitted_at=CASE WHEN p_action='Needs clearer photo' THEN NULL ELSE submitted_at END,
      expires_at=CASE WHEN p_action='Needs clearer photo' THEN now()+interval '10 minutes' ELSE expires_at END,
      updated_at=now()
  WHERE id=p_request_id;
  INSERT INTO cornhill_school.evidence_capture_events(request_id,actor_staff_id,event_code,details)
  VALUES(p_request_id,p_actor_staff_id,
    CASE p_action WHEN 'Approved' THEN 'evidence.approved'
      WHEN 'Rejected' THEN 'evidence.rejected' ELSE 'evidence.reupload_requested' END,
    jsonb_build_object('note',nullif(btrim(coalesce(p_note,'')),'')));
  RETURN v_next_status;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.finance_get_evidence_request(
    p_actor_staff_id uuid,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_request cornhill_school.evidence_capture_requests%ROWTYPE; v_can_review boolean;
BEGIN
  SELECT * INTO v_request FROM cornhill_school.evidence_capture_requests WHERE id=p_request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT EXISTS(
    SELECT 1 FROM cornhill_auth.staff_accounts sa
    JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id=sa.id
    JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code=ra.role_code
    JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
    WHERE sa.id=p_actor_staff_id AND sa.account_status='active'
      AND sp.employment_status='Active' AND rp.permission_code='finance.evidence_review'
  ) INTO v_can_review;
  IF NOT v_can_review AND NOT EXISTS(
    SELECT 1 FROM cornhill_auth.staff_accounts sa
    JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id=sa.id
    JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code=ra.role_code
    JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
    WHERE sa.id=p_actor_staff_id AND sa.account_status='active'
      AND sp.employment_status='Active' AND rp.permission_code='finance.evidence_manage'
  ) THEN RAISE EXCEPTION 'Staff account lacks permission to access financial evidence' USING ERRCODE='42501'; END IF;
  IF NOT v_can_review AND p_actor_staff_id NOT IN(v_request.assigned_staff_id,v_request.requested_by_staff_id) THEN
    RAISE EXCEPTION 'Evidence request is outside this staff member scope' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'request_id',v_request.id,'purpose',v_request.purpose,'context_type',v_request.context_type,
    'context_record_id',v_request.context_record_id,'context_label',v_request.context_label,
    'amount_ugx',v_request.amount_ugx,'status',v_request.status,'expires_at',v_request.expires_at,
    'files',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'file_id',f.id,'storage_object_key',f.storage_object_key,'sha256',f.sha256,
      'content_type',f.content_type,'size_bytes',f.size_bytes,'original_file_name',f.original_file_name
    ) ORDER BY f.uploaded_at) FROM cornhill_school.evidence_capture_files f WHERE f.request_id=v_request.id),'[]'::jsonb)
  );
END $fn$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA cornhill_school FROM cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA cornhill_school FROM cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA cornhill_school FROM cornhill_finance_runtime,cornhill_finance_api;
GRANT EXECUTE ON FUNCTION cornhill_school.create_local_evidence_request(uuid,uuid,text,text,uuid,text,bigint) TO cornhill_finance_runtime;
GRANT EXECUTE ON FUNCTION cornhill_school.register_local_evidence_file(uuid,uuid,uuid,text,text,bigint,text) TO cornhill_finance_runtime;
GRANT EXECUTE ON FUNCTION cornhill_school.submit_local_evidence_request(uuid,uuid) TO cornhill_finance_runtime;
GRANT EXECUTE ON FUNCTION cornhill_school.review_local_evidence_request(uuid,uuid,text,text) TO cornhill_finance_runtime;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_get_evidence_request(uuid,uuid) TO cornhill_finance_runtime;

COMMIT;
