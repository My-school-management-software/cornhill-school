-- V49: append-only, individually received Nursery materials. REVIEW/CLONE TEST ONLY.
-- No retrospective class-level marking, no payment/synchronization changes.
BEGIN;

CREATE TABLE cornhill_school.nursery_material_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  material_name text NOT NULL CHECK (length(trim(material_name)) BETWEEN 2 AND 100),
  quantity_received integer NOT NULL CHECK (quantity_received BETWEEN 1 AND 1000),
  received_date date NOT NULL,
  notes text CHECK (notes IS NULL OR length(trim(notes)) <= 300),
  recorded_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nursery_material_name_normalized CHECK (material_name = trim(material_name)),
  CONSTRAINT nursery_material_received_date_valid CHECK (received_date >= DATE '2000-01-01')
);
CREATE INDEX nursery_material_receipts_learner_date
  ON cornhill_school.nursery_material_receipts
  (learner_id, received_date DESC, created_at DESC);

-- Not even an administrator can quietly change a historical receipt row.
CREATE FUNCTION cornhill_school.prevent_nursery_material_receipt_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school AS $body$
BEGIN
  RAISE EXCEPTION 'Nursery material receipt history is append-only'
    USING ERRCODE = 'check_violation';
END
$body$;
CREATE TRIGGER nursery_material_receipts_append_only
  BEFORE UPDATE OR DELETE ON cornhill_school.nursery_material_receipts
  FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_nursery_material_receipt_mutation();

REVOKE ALL ON cornhill_school.nursery_material_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.prevent_nursery_material_receipt_mutation() FROM PUBLIC;
GRANT SELECT, INSERT ON cornhill_school.nursery_material_receipts TO cornhill_auth_runtime;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON cornhill_school.nursery_material_receipts FROM cornhill_auth_runtime;
GRANT SELECT (id, section) ON cornhill_school.classes TO cornhill_auth_runtime;

COMMIT;
