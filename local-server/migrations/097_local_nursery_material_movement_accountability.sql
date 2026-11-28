-- V49: learner-specific movement and director-approved surplus accountability.
-- Additive and isolated-PostgreSQL-17 rehearsal only. Never run on school DB without approval.
BEGIN;

CREATE TABLE cornhill_school.nursery_material_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE,
 learner_id uuid NOT NULL REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
 material_name text NOT NULL CHECK (length(material_name) BETWEEN 2 AND 100 AND material_name = trim(material_name)),
 movement_type text NOT NULL CHECK (movement_type IN ('teacher_issue','teacher_return','learner_used','director_surplus')),
 quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
 movement_date date NOT NULL CHECK (movement_date >= DATE '2000-01-01'),
 teacher_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 recorded_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 approved_by_director_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 surplus_unit_value_ugx bigint CHECK (surplus_unit_value_ugx BETWEEN 0 AND 1000000000),
 reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 300),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT nursery_movement_staff_scope CHECK (
   (movement_type IN ('teacher_issue','teacher_return','learner_used') AND teacher_staff_id IS NOT NULL
    AND approved_by_director_staff_id IS NULL AND surplus_unit_value_ugx IS NULL)
   OR (movement_type='director_surplus' AND teacher_staff_id IS NULL
    AND approved_by_director_staff_id IS NOT NULL AND surplus_unit_value_ugx IS NOT NULL)
 )
);
CREATE INDEX nursery_material_movements_learner_stock_idx
 ON cornhill_school.nursery_material_movements
 (learner_id, lower(material_name), movement_date DESC, created_at DESC);
CREATE INDEX nursery_material_movements_teacher_idx
 ON cornhill_school.nursery_material_movements
 (teacher_staff_id, learner_id, movement_date DESC)
 WHERE teacher_staff_id IS NOT NULL;
CREATE INDEX nursery_material_movements_record_centre_idx
 ON cornhill_school.nursery_material_movements
 (movement_type, movement_date DESC);

-- Immutable audit; corrections require separately reviewed compensating entries,
-- not silent modification of a teacher's withdrawal or a Director transfer.
CREATE TRIGGER nursery_material_movements_append_only
 BEFORE UPDATE OR DELETE ON cornhill_school.nursery_material_movements
 FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_nursery_material_receipt_mutation();

REVOKE ALL ON cornhill_school.nursery_material_movements FROM PUBLIC;
GRANT SELECT, INSERT ON cornhill_school.nursery_material_movements TO cornhill_auth_runtime;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
 ON cornhill_school.nursery_material_movements FROM cornhill_auth_runtime;

-- Runtime can inspect active staff and their CURRENT role assignments to
-- ensure that the teacher receiving or returning materials is a real staff member.
GRANT SELECT (id, username, account_status) ON cornhill_auth.staff_accounts TO cornhill_auth_runtime;
GRANT SELECT (staff_account_id, role_code) ON cornhill_auth.staff_role_assignments TO cornhill_auth_runtime;

COMMIT;
