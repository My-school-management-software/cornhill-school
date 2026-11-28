-- CORNHILL V50: annually approved school fees and separately priced Income B.
-- ADDITIVE; local PostgreSQL only. Clone-test before working-db approval.
BEGIN;

ALTER TABLE cornhill_school.fee_catalogue
  ADD COLUMN income_group text NOT NULL DEFAULT 'A'
  CHECK (income_group IN ('A','B'));

-- Preserve all historical obligations and receipts; classify existing
-- graduation items going forward without mutating posted transactions.
UPDATE cornhill_school.fee_catalogue SET income_group='B'
WHERE item_code='GRADUATION';

INSERT INTO cornhill_school.fee_catalogue
  (item_code,item_name,category,income_group,default_amount_ugx)
VALUES
  ('TOP_CLASS_GRADUATION','Top Class graduation','graduation','B',0),
  ('MOCK_EXAMS','Mock examinations','other','B',0),
  ('PRE_MOCK_EXAMS','Pre-mock examinations','other','B',0),
  ('MUNICIPALITY_EXAMS','Municipality examinations','other','B',0),
  ('SCHOOL_TRIP','School trip','other','B',0),
  ('GRADUATION_TRIP','Graduation trip','graduation','B',0),
  ('WESTERN_PARADISE','Western Paradise','other','B',0)
ON CONFLICT (item_code) DO NOTHING;

-- Existing academic years retain their existing fee arrangements.
-- Newly created years must have a reviewed annual school-fee policy.
ALTER TABLE cornhill_school.academic_years
  ADD COLUMN annual_fee_policy_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE cornhill_school.academic_years
  ALTER COLUMN annual_fee_policy_enabled SET DEFAULT true;

CREATE TABLE cornhill_school.annual_school_fee_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES cornhill_school.academic_years(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES cornhill_school.classes(id) ON DELETE RESTRICT,
  learner_type text NOT NULL CHECK (learner_type IN ('Day','Boarding')),
  amount_ugx bigint NOT NULL CHECK (amount_ugx >= 0),
  decision text NOT NULL CHECK (decision IN ('Initial','Continued','Revised')),
  prior_rate_id uuid REFERENCES cornhill_school.annual_school_fee_rates(id) ON DELETE RESTRICT,
  meeting_reference text CHECK (meeting_reference IS NULL OR length(btrim(meeting_reference)) BETWEEN 4 AND 300),
  approved_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academic_year_id,class_id,learner_type),
  CONSTRAINT year_fee_decision_valid CHECK (
     (decision='Initial' AND prior_rate_id IS NULL)
     OR (decision='Continued' AND prior_rate_id IS NOT NULL)
     OR (decision='Revised' AND prior_rate_id IS NOT NULL AND meeting_reference IS NOT NULL)
  )
);

-- The approved annual amount is not retrospectively rewritten.
CREATE FUNCTION cornhill_school.validate_annual_school_fee_rate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $body$
DECLARE y record; previous_rate record;
BEGIN
  SELECT starts_on,status INTO y FROM cornhill_school.academic_years
  WHERE id=NEW.academic_year_id FOR SHARE;
  IF NOT FOUND OR y.status<>'Planned' THEN
    RAISE EXCEPTION 'Approve annual school fees only while the new academic year is planned'
      USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM cornhill_auth.staff_accounts a
    JOIN cornhill_auth.staff_role_assignments r ON r.staff_account_id=a.id
    WHERE a.id=NEW.approved_by_staff_id AND a.account_status='active' AND r.role_code='director'
  ) THEN
    RAISE EXCEPTION 'Only the active Director can approve annual school fees'
      USING ERRCODE='42501';
  END IF;
  IF NEW.prior_rate_id IS NOT NULL THEN
    SELECT prior.*, py.starts_on AS prior_year_start INTO previous_rate
    FROM cornhill_school.annual_school_fee_rates prior
    JOIN cornhill_school.academic_years py ON py.id=prior.academic_year_id
    WHERE prior.id=NEW.prior_rate_id;
    IF NOT FOUND OR previous_rate.class_id<>NEW.class_id
      OR previous_rate.learner_type<>NEW.learner_type
      OR previous_rate.prior_year_start>=y.starts_on THEN
      RAISE EXCEPTION 'Carry-forward rate must belong to an earlier year and the same class and learner type'
        USING ERRCODE='23514';
    END IF;
    IF NEW.decision='Continued' AND NEW.amount_ugx<>previous_rate.amount_ugx THEN
      RAISE EXCEPTION 'Continued school fees must equal the previously approved amount'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$body$;

CREATE TRIGGER annual_school_fee_rate_approval_guard
BEFORE INSERT ON cornhill_school.annual_school_fee_rates
FOR EACH ROW EXECUTE FUNCTION cornhill_school.validate_annual_school_fee_rate();

CREATE TABLE cornhill_school.income_b_item_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES cornhill_school.academic_years(id) ON DELETE RESTRICT,
  fee_item_id uuid NOT NULL REFERENCES cornhill_school.fee_catalogue(id) ON DELETE RESTRICT,
  effective_on date NOT NULL,
  amount_ugx bigint NOT NULL CHECK (amount_ugx >= 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 4 AND 300),
  approved_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fee_item_id,effective_on)
);
CREATE INDEX income_b_item_price_year_idx
  ON cornhill_school.income_b_item_price_history(academic_year_id,fee_item_id,effective_on DESC);

CREATE FUNCTION cornhill_school.validate_income_b_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $body$
DECLARE fee_group text; y record;
BEGIN
  SELECT income_group INTO fee_group FROM cornhill_school.fee_catalogue
  WHERE id=NEW.fee_item_id AND is_active=true;
  IF fee_group IS DISTINCT FROM 'B' THEN
    RAISE EXCEPTION 'Only Income B items can receive flexible price revisions'
      USING ERRCODE='23514';
  END IF;
  SELECT starts_on,ends_on INTO y FROM cornhill_school.academic_years
  WHERE id=NEW.academic_year_id;
  IF NOT FOUND OR NEW.effective_on NOT BETWEEN y.starts_on AND y.ends_on THEN
    RAISE EXCEPTION 'Income B price must be effective inside its academic year'
      USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM cornhill_auth.staff_accounts a
    JOIN cornhill_auth.staff_role_assignments r ON r.staff_account_id=a.id
    JOIN cornhill_auth.staff_role_permissions p ON p.role_code=r.role_code
    WHERE a.id=NEW.approved_by_staff_id AND a.account_status='active'
      AND p.permission_code='finance.fees_manage'
  ) THEN
    RAISE EXCEPTION 'A staff member authorised to manage fees must approve an Income B price'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$body$;
CREATE TRIGGER income_b_price_approval_guard
BEFORE INSERT ON cornhill_school.income_b_item_price_history
FOR EACH ROW EXECUTE FUNCTION cornhill_school.validate_income_b_price();

-- An old price remains evidence for charges made before the revision.
CREATE FUNCTION cornhill_school.prevent_v50_rate_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog
AS $body$
BEGIN
  RAISE EXCEPTION 'Approved fee rates and price histories are append-only'
    USING ERRCODE='23514';
END;
$body$;
CREATE TRIGGER annual_school_fee_rates_append_only
BEFORE UPDATE OR DELETE ON cornhill_school.annual_school_fee_rates
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_v50_rate_history_mutation();
CREATE TRIGGER income_b_item_prices_append_only
BEFORE UPDATE OR DELETE ON cornhill_school.income_b_item_price_history
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_v50_rate_history_mutation();

-- No public/direct runtime writes. Controlled API endpoints require separate
-- privilege-scoped workflows; this migration alone cannot post or revise a fee.
REVOKE ALL ON cornhill_school.annual_school_fee_rates,
  cornhill_school.income_b_item_price_history FROM PUBLIC, cornhill_auth_runtime, cornhill_finance_runtime;
REVOKE ALL ON FUNCTION cornhill_school.validate_annual_school_fee_rate(),
  cornhill_school.validate_income_b_price(),
  cornhill_school.prevent_v50_rate_history_mutation() FROM PUBLIC;
COMMIT;
