-- V124C PROPOSED ONLY: do not run against working CORNHILL database.
-- Filename intentionally outside numbered migrations: V124B uses later local changes
-- and migration number must be assigned only after reconciliation and Director approval.
-- This is a PROTOTYPE restricted PostgreSQL 17 reporting function.
BEGIN;

CREATE FUNCTION cornhill_school.v124c_preview_pupil_balances(
  p_actor uuid,
  p_year integer DEFAULT NULL,
  p_term integer DEFAULT NULL,
  p_class text DEFAULT '',
  p_status text DEFAULT 'all',
  p_query text DEFAULT '',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE
  v_year text;
  v_term smallint;
  v_asof timestamptz := statement_timestamp();
  v_rows jsonb;
  v_count bigint;
  v_previous bigint;
  v_current bigint;
BEGIN
  IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.reports_read')
     OR NOT EXISTS (
       SELECT 1 FROM cornhill_auth.staff_role_assignments ra
       WHERE ra.staff_account_id=p_actor AND ra.role_code IN ('director','bursar','deputy_bursar')
     )
  THEN
    RAISE EXCEPTION 'Finance reporting permission required' USING ERRCODE='42501';
  END IF;
  IF (p_year IS NOT NULL AND p_year NOT BETWEEN 2000 AND 2200)
    OR (p_term IS NOT NULL AND p_term NOT BETWEEN 1 AND 3)
    OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size NOT BETWEEN 1 AND 100
    OR length(coalesce(p_class,''))>60 OR length(coalesce(p_query,''))>80
    OR coalesce(p_status,'all') NOT IN ('all','unpaid','partly_paid','paid')
  THEN
    RAISE EXCEPTION 'Invalid report filters' USING ERRCODE='22023';
  END IF;

  -- The anchor is the requested term or latest configured term.
  -- When a year is given without a term, select its latest configured term.
  SELECT ay.year_label, t.term_number INTO v_year,v_term
  FROM cornhill_school.academic_terms t
  JOIN cornhill_school.academic_years ay ON ay.id=t.academic_year_id
  WHERE (p_year IS NULL OR split_part(ay.year_label,'/',1)=p_year::text OR split_part(ay.year_label,'-',1)=p_year::text)
    AND (p_term IS NULL OR t.term_number=p_term)
  ORDER BY CASE WHEN t.status='Active' THEN 0 ELSE 1 END,
           ay.starts_on DESC,t.term_number DESC
  LIMIT 1;
  IF v_year IS NULL THEN
    RAISE EXCEPTION 'No configured academic term matches report selection' USING ERRCODE='22023';
  END IF;

  -- Each obligation's authoritative balance comes from fee_obligation_balances
  -- (posted allocations only). No cached/browser totals or duplicate ledger.
  WITH scoped AS (
    SELECT l.id, l.pupil_code AS pupil_code,
      concat_ws(' ',l.first_name,l.middle_name,l.last_name) AS learner_name,
      c.display_name AS class_name,
      v_year AS academic_year, v_term AS term,
      COALESCE(sum(v.balance_ugx) FILTER(
        WHERE (split_part(v.academic_year,'/',1),v.term_number) <
              (split_part(v_year,'/',1),v_term)),0)::bigint AS previous_debt,
      COALESCE(sum(v.balance_ugx) FILTER(
        WHERE (v.academic_year,v.term_number)=(v_year,v_term)),0)::bigint AS current_debt,
      COALESCE(sum(v.amount_ugx) FILTER(
        WHERE (v.academic_year,v.term_number)=(v_year,v_term)),0)::bigint AS current_charges,
      COALESCE(sum(v.paid_ugx) FILTER(
        WHERE (v.academic_year,v.term_number)=(v_year,v_term)),0)::bigint AS current_paid
    FROM cornhill_school.learners l
    LEFT JOIN cornhill_school.classes c ON c.id=l.class_id
    LEFT JOIN cornhill_school.fee_obligation_balances v ON v.learner_id=l.id
    WHERE (p_class='' OR c.display_name=p_class)
      AND (p_query='' OR l.pupil_code ILIKE '%'||p_query||'%' OR
          concat_ws(' ',l.first_name,l.middle_name,l.last_name) ILIKE '%'||p_query||'%')
      AND l.status='Active'
    GROUP BY l.id,l.pupil_code,l.first_name,l.middle_name,l.last_name,c.display_name
  ), amounts AS (
    SELECT *,previous_debt+current_debt AS combined_balance,
      CASE WHEN previous_debt+current_debt=0 THEN 'paid'
           WHEN current_paid>0 THEN 'partly_paid' ELSE 'unpaid' END AS payment_status
    FROM scoped
  ), filtered AS (
    SELECT * FROM amounts
    WHERE p_status='all' OR payment_status=p_status
  ), totals AS (
    SELECT count(*)::bigint AS n, COALESCE(sum(previous_debt),0)::bigint AS previous,
      COALESCE(sum(current_debt),0)::bigint AS current FROM filtered
  ), page AS (
    SELECT * FROM filtered ORDER BY class_name,pupil_code,id
    LIMIT p_page_size OFFSET (p_page-1)*p_page_size
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'pupilCode',pupil_code,'learnerName',learner_name,'className',class_name,
      'academicYear',academic_year,'term',term,
      'previousTermOutstandingUgx',previous_debt,
      'currentTermChargesUgx',current_charges,
      'allocatedPaymentsUgx',current_paid,
      'approvedReliefUgx',0,
      'currentTermOutstandingUgx',current_debt,
      'totalOutstandingUgx',combined_balance,
      'paymentStatus',payment_status
      ) ORDER BY class_name,pupil_code) FROM page),'[]'::jsonb),
    (SELECT n FROM totals),(SELECT previous FROM totals),(SELECT current FROM totals)
  INTO v_rows,v_count,v_previous,v_current;

  RETURN jsonb_build_object(
    'asOf',v_asof,
    'rows',v_rows,
    'totals',jsonb_build_object(
      'rowCount',v_count,'previousTermOutstandingUgx',v_previous,
      'currentTermOutstandingUgx',v_current,
      'totalOutstandingUgx',v_previous+v_current),
    'anchor',jsonb_build_object('academicYear',v_year,'term',v_term),
    'limitations',jsonb_build_array(
      'Prototype uses only active learners and current class; historical class mapping pending.',
      'Approved relief and retained credit are not itemised by this prototype; do not display zero as confirmed relief.',
      'Only the chosen term and older debt are included; later terms excluded.',
      'Payment status reflects posted allocations, not unallocated credit or historical payment volumes.'
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION cornhill_school.v124c_preview_pupil_balances(uuid,integer,integer,text,text,text,integer,integer)
FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_api,cornhill_finance_runtime;
GRANT EXECUTE ON FUNCTION cornhill_school.v124c_preview_pupil_balances(uuid,integer,integer,text,text,text,integer,integer)
TO cornhill_finance_runtime;

COMMIT;
