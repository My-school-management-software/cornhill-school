-- CORNHILL immutable academic result snapshots and learner progression history.
-- Additive only: existing learners, assessments, marks and enrolment periods remain unchanged.
-- Upper-primary grade bands mirror the workbook boundaries in the checked-in hosted
-- academic migrations. Division cut-offs are intentionally not seeded because the
-- source migration stream does not define them; the school must configure those rules.

BEGIN;

CREATE TABLE cornhill_school.academic_grading_schemes (
  scheme_code text PRIMARY KEY,
  scheme_name text NOT NULL,
  class_section text NOT NULL CHECK (class_section IN ('Nursery', 'Primary')),
  first_level smallint NOT NULL CHECK (first_level BETWEEN 1 AND 10),
  last_level smallint NOT NULL CHECK (last_level BETWEEN first_level AND 10),
  uses_subject_aggregates boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scheme_code ~ '^[a-z][a-z0-9_]{2,49}$'),
  CHECK (length(trim(scheme_name)) BETWEEN 2 AND 100)
);

INSERT INTO cornhill_school.academic_grading_schemes
  (scheme_code, scheme_name, class_section, first_level, last_level, uses_subject_aggregates)
VALUES
  ('nursery_ae', 'Nursery A–E competency scale', 'Nursery', 1, 3, false),
  ('lower_primary_ae', 'P.1–P.3 A–E scale', 'Primary', 4, 6, false),
  ('upper_primary_uneb', 'P.4–P.7 UNEB subject scale', 'Primary', 7, 10, true)
ON CONFLICT (scheme_code) DO NOTHING;

CREATE TABLE cornhill_school.academic_grade_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_code text NOT NULL REFERENCES cornhill_school.academic_grading_schemes(scheme_code) ON DELETE RESTRICT,
  subject_id uuid REFERENCES cornhill_school.subjects(id) ON DELETE RESTRICT,
  grade_code text NOT NULL CHECK (grade_code ~ '^[A-Z][A-Z0-9]{0,3}$'),
  min_percent numeric(5,2) NOT NULL CHECK (min_percent BETWEEN 0 AND 100),
  max_percent numeric(5,2) NOT NULL CHECK (max_percent BETWEEN 0 AND 100),
  grade_point smallint CHECK (grade_point BETWEEN 1 AND 9),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_percent <= max_percent),
  UNIQUE (scheme_code, grade_code, subject_id)
);

CREATE UNIQUE INDEX academic_grade_band_scope_unique
  ON cornhill_school.academic_grade_bands
    (scheme_code, grade_code, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX academic_grade_band_lookup_idx
  ON cornhill_school.academic_grade_bands (scheme_code, subject_id, min_percent, max_percent);

INSERT INTO cornhill_school.academic_grade_bands (scheme_code, grade_code, min_percent, max_percent)
SELECT scheme.scheme_code, bands.grade_code, bands.min_percent, bands.max_percent
FROM (VALUES ('nursery_ae'), ('lower_primary_ae')) AS scheme(scheme_code)
CROSS JOIN (VALUES
  ('A', 80.00::numeric, 100.00::numeric),
  ('B', 70.00::numeric, 79.99::numeric),
  ('C', 60.00::numeric, 69.99::numeric),
  ('D', 50.00::numeric, 59.99::numeric),
  ('E', 0.00::numeric, 49.99::numeric)
) AS bands(grade_code, min_percent, max_percent)
WHERE NOT EXISTS (
  SELECT 1 FROM cornhill_school.academic_grade_bands existing
  WHERE existing.scheme_code = scheme.scheme_code
    AND existing.grade_code = bands.grade_code AND existing.subject_id IS NULL
);

INSERT INTO cornhill_school.academic_grade_bands
  (scheme_code, subject_id, grade_code, min_percent, max_percent, grade_point)
SELECT 'upper_primary_uneb', subject.id, bands.grade_code,
       bands.min_percent, bands.max_percent, bands.grade_point
FROM cornhill_school.subjects subject
JOIN (VALUES ('ENGLISH'), ('MATHEMATICS'), ('SCIENCE'), ('SOCIAL_STUDIES'))
  AS core(subject_code) ON core.subject_code = subject.subject_code
CROSS JOIN (VALUES
  ('D1', 89.00::numeric, 100.00::numeric, 1::smallint),
  ('D2', 79.00::numeric, 88.99::numeric, 2::smallint),
  ('C3', 74.00::numeric, 78.99::numeric, 3::smallint),
  ('C4', 69.00::numeric, 73.99::numeric, 4::smallint),
  ('C5', 59.00::numeric, 68.99::numeric, 5::smallint),
  ('C6', 49.00::numeric, 58.99::numeric, 6::smallint),
  ('P7', 44.00::numeric, 48.99::numeric, 7::smallint),
  ('P8', 39.00::numeric, 43.99::numeric, 8::smallint),
  ('F9', 0.00::numeric, 38.99::numeric, 9::smallint)
) AS bands(grade_code, min_percent, max_percent, grade_point)
WHERE NOT EXISTS (
  SELECT 1 FROM cornhill_school.academic_grade_bands existing
  WHERE existing.scheme_code = 'upper_primary_uneb'
    AND existing.subject_id = subject.id AND existing.grade_code = bands.grade_code
);

CREATE TABLE cornhill_school.academic_division_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_code text NOT NULL REFERENCES cornhill_school.academic_grading_schemes(scheme_code) ON DELETE RESTRICT,
  division_code text NOT NULL CHECK (length(trim(division_code)) BETWEEN 1 AND 20),
  min_aggregate smallint NOT NULL CHECK (min_aggregate BETWEEN 4 AND 36),
  max_aggregate smallint NOT NULL CHECK (max_aggregate BETWEEN 4 AND 36),
  created_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scheme_code = 'upper_primary_uneb'),
  CHECK (min_aggregate <= max_aggregate),
  UNIQUE (scheme_code, division_code)
);

CREATE FUNCTION cornhill_school.guard_academic_division_band_overlap()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cornhill_school.academic_division_bands existing
    WHERE existing.scheme_code = NEW.scheme_code
      AND existing.id IS DISTINCT FROM NEW.id
      AND NEW.min_aggregate <= existing.max_aggregate
      AND existing.min_aggregate <= NEW.max_aggregate
  ) THEN
    RAISE EXCEPTION 'Academic division aggregate ranges cannot overlap'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER academic_division_band_overlap_guard
BEFORE INSERT OR UPDATE ON cornhill_school.academic_division_bands
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_academic_division_band_overlap();

CREATE TABLE cornhill_school.academic_report_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
  assessment_id uuid NOT NULL REFERENCES cornhill_school.assessments(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES cornhill_school.academic_years(id) ON DELETE RESTRICT,
  academic_term_id uuid NOT NULL REFERENCES cornhill_school.academic_terms(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES cornhill_school.classes(id) ON DELETE RESTRICT,
  enrolment_period_id uuid NOT NULL REFERENCES cornhill_school.enrolment_periods(id) ON DELETE RESTRICT,
  pupil_code_snapshot text NOT NULL,
  lin_snapshot text,
  learner_name_snapshot text NOT NULL,
  p7_index_number_snapshot text,
  class_code_snapshot text NOT NULL,
  class_name_snapshot text NOT NULL,
  assessment_name_snapshot text NOT NULL,
  assessment_type_snapshot text NOT NULL,
  assessment_date date NOT NULL,
  academic_year_label_snapshot text NOT NULL,
  academic_term_number_snapshot smallint NOT NULL CHECK (academic_term_number_snapshot BETWEEN 1 AND 3),
  academic_term_name_snapshot text NOT NULL,
  grading_scheme_code text NOT NULL REFERENCES cornhill_school.academic_grading_schemes(scheme_code) ON DELETE RESTRICT,
  subject_results jsonb NOT NULL CHECK (jsonb_typeof(subject_results) = 'array'),
  total_score numeric(12,2) NOT NULL CHECK (total_score >= 0),
  total_possible numeric(12,2) NOT NULL CHECK (total_possible > 0),
  average_percent numeric(5,2) NOT NULL CHECK (average_percent BETWEEN 0 AND 100),
  aggregate_total smallint CHECK (aggregate_total BETWEEN 4 AND 36),
  division_code text,
  class_position integer NOT NULL CHECK (class_position >= 1),
  class_size integer NOT NULL CHECK (class_size >= 1 AND class_position <= class_size),
  generated_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_card_aggregate_scheme_consistent CHECK (
    (grading_scheme_code = 'upper_primary_uneb' AND aggregate_total IS NOT NULL)
    OR (grading_scheme_code <> 'upper_primary_uneb' AND aggregate_total IS NULL AND division_code IS NULL)
  ),
  UNIQUE (assessment_id, learner_id)
);
CREATE INDEX academic_report_cards_learner_history_idx
  ON cornhill_school.academic_report_cards (learner_id, assessment_date DESC, generated_at DESC);
CREATE INDEX academic_report_cards_class_position_idx
  ON cornhill_school.academic_report_cards (class_id, assessment_id, class_position);

CREATE TABLE cornhill_school.learner_progression_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
  from_enrolment_period_id uuid NOT NULL UNIQUE REFERENCES cornhill_school.enrolment_periods(id) ON DELETE RESTRICT,
  to_enrolment_period_id uuid UNIQUE REFERENCES cornhill_school.enrolment_periods(id) ON DELETE RESTRICT,
  from_class_id uuid NOT NULL REFERENCES cornhill_school.classes(id) ON DELETE RESTRICT,
  to_class_id uuid REFERENCES cornhill_school.classes(id) ON DELETE RESTRICT,
  academic_term_id uuid NOT NULL REFERENCES cornhill_school.academic_terms(id) ON DELETE RESTRICT,
  progression_type text NOT NULL CHECK (progression_type IN ('Promoted', 'Repeated', 'Completed')),
  effective_date date NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 2 AND 300),
  approved_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (progression_type = 'Completed' AND to_enrolment_period_id IS NULL AND to_class_id IS NULL)
    OR (progression_type IN ('Promoted', 'Repeated') AND to_enrolment_period_id IS NOT NULL AND to_class_id IS NOT NULL)
  )
);
CREATE INDEX learner_progression_history_idx
  ON cornhill_school.learner_progression_events (learner_id, effective_date DESC, created_at DESC);

CREATE FUNCTION cornhill_school.prevent_academic_history_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school AS $function$
BEGIN
  RAISE EXCEPTION 'Published academic results and progression history are append-only'
    USING ERRCODE = 'check_violation';
END;
$function$;
CREATE TRIGGER academic_report_cards_append_only
BEFORE UPDATE OR DELETE ON cornhill_school.academic_report_cards
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_academic_history_mutation();
CREATE TRIGGER learner_progression_events_append_only
BEFORE UPDATE OR DELETE ON cornhill_school.learner_progression_events
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_academic_history_mutation();

CREATE OR REPLACE FUNCTION cornhill_school.academic_actor_has_permission(
  p_actor_staff_id uuid, p_permission_code text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM cornhill_auth.staff_accounts account
    JOIN cornhill_auth.staff_role_assignments assignment
      ON assignment.staff_account_id = account.id
    JOIN cornhill_auth.staff_role_permissions permission
      ON permission.role_code = assignment.role_code
    JOIN cornhill_school.staff_profiles profile
      ON profile.staff_account_id = account.id
    WHERE account.id = p_actor_staff_id
      AND account.account_status = 'active'
      AND profile.employment_status = 'Active'
      AND permission.permission_code = p_permission_code
  )
$function$;

CREATE FUNCTION cornhill_school.generate_academic_report_cards(
  p_assessment_id uuid, p_actor_staff_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_assessment record;
  v_scheme_code text;
  v_uses_aggregates boolean;
  v_existing_count integer;
  v_learner_count integer;
  v_subject_count integer;
  v_inserted_count integer;
BEGIN
  IF NOT cornhill_school.academic_actor_has_permission(p_actor_staff_id, 'academics.results_publish') THEN
    RAISE EXCEPTION 'Staff account lacks academic result publication permission'
      USING ERRCODE = '42501';
  END IF;

  SELECT assessment.id, assessment.academic_term_id, term.academic_year_id,
         assessment.class_id, class.class_code, class.display_name,
         class.section, class.level_order,
         assessment.assessment_name, assessment.assessment_type,
         COALESCE(assessment.assessment_date, assessment.created_at::date) AS effective_date,
         assessment.max_score, assessment.status, assessment.published_at,
         term.term_number, term.term_name, year.year_label,
         term.starts_on AS term_starts_on, term.ends_on AS term_ends_on
    INTO v_assessment
    FROM cornhill_school.assessments assessment
    JOIN cornhill_school.academic_terms term ON term.id = assessment.academic_term_id
    JOIN cornhill_school.academic_years year ON year.id = term.academic_year_id
    JOIN cornhill_school.classes class ON class.id = assessment.class_id
   WHERE assessment.id = p_assessment_id
   FOR UPDATE OF assessment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Academic assessment was not found' USING ERRCODE = '23503';
  END IF;
  IF v_assessment.status <> 'Published' OR v_assessment.published_at IS NULL THEN
    RAISE EXCEPTION 'Report cards can only be generated from a published assessment'
      USING ERRCODE = '23514';
  END IF;
  IF v_assessment.effective_date < v_assessment.term_starts_on
     OR v_assessment.effective_date > v_assessment.term_ends_on THEN
    RAISE EXCEPTION 'Assessment date must fall within its academic term'
      USING ERRCODE = '23514';
  END IF;

  SELECT scheme.scheme_code, scheme.uses_subject_aggregates
    INTO v_scheme_code, v_uses_aggregates
    FROM cornhill_school.academic_grading_schemes scheme
   WHERE scheme.is_active = true
     AND scheme.class_section = v_assessment.section
     AND v_assessment.level_order BETWEEN scheme.first_level AND scheme.last_level;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active grading scheme is configured for this class'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer INTO v_existing_count
    FROM cornhill_school.academic_report_cards WHERE assessment_id = p_assessment_id;
  IF v_existing_count > 0 THEN
    RETURN v_existing_count;
  END IF;

  SELECT count(*)::integer INTO v_subject_count
    FROM cornhill_school.class_subjects class_subject
    JOIN cornhill_school.subjects subject ON subject.id = class_subject.subject_id
   WHERE class_subject.class_id = v_assessment.class_id
     AND class_subject.is_active = true AND subject.is_active = true;
  IF v_subject_count = 0 THEN
    RAISE EXCEPTION 'The assessment class has no active subjects' USING ERRCODE = '23514';
  END IF;
  IF v_assessment.class_code IN ('P4', 'P5', 'P6', 'P7') AND
     (v_subject_count <> 4 OR NOT EXISTS (
       SELECT 1 FROM cornhill_school.class_subjects class_subject
       JOIN cornhill_school.subjects subject ON subject.id = class_subject.subject_id
       WHERE class_subject.class_id = v_assessment.class_id
         AND class_subject.is_active = true AND subject.is_active = true
       GROUP BY class_subject.class_id
       HAVING array_agg(subject.subject_code ORDER BY subject.subject_code) =
         ARRAY['ENGLISH', 'MATHEMATICS', 'SCIENCE', 'SOCIAL_STUDIES']::text[]
     )) THEN
    RAISE EXCEPTION 'P.4–P.7 results require the four configured core aggregate subjects'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer INTO v_learner_count
    FROM cornhill_school.enrolment_periods enrolment
   WHERE enrolment.class_id = v_assessment.class_id
     AND enrolment.admission_date <= v_assessment.effective_date
     AND (enrolment.exit_date IS NULL OR enrolment.exit_date >= v_assessment.effective_date);
  IF v_learner_count = 0 THEN
    RAISE EXCEPTION 'No learner was enrolled in the assessment class on the assessment date'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT enrolment.learner_id
      FROM cornhill_school.enrolment_periods enrolment
     WHERE enrolment.class_id = v_assessment.class_id
       AND enrolment.admission_date <= v_assessment.effective_date
       AND (enrolment.exit_date IS NULL OR enrolment.exit_date >= v_assessment.effective_date)
     GROUP BY enrolment.learner_id HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'Each learner must have exactly one historical class enrolment on the assessment date'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM cornhill_school.enrolment_periods enrolment
      CROSS JOIN cornhill_school.class_subjects class_subject
      JOIN cornhill_school.subjects subject ON subject.id = class_subject.subject_id
      LEFT JOIN cornhill_school.learner_marks mark
        ON mark.assessment_id = p_assessment_id
       AND mark.learner_id = enrolment.learner_id
       AND mark.subject_id = class_subject.subject_id
     WHERE enrolment.class_id = v_assessment.class_id
       AND enrolment.admission_date <= v_assessment.effective_date
       AND (enrolment.exit_date IS NULL OR enrolment.exit_date >= v_assessment.effective_date)
       AND class_subject.class_id = v_assessment.class_id
       AND class_subject.is_active = true AND subject.is_active = true
       AND mark.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Every enrolled learner must have a mark for every active class subject before report cards are generated'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM cornhill_school.enrolment_periods enrolment
      JOIN cornhill_school.learner_marks mark
        ON mark.assessment_id = p_assessment_id AND mark.learner_id = enrolment.learner_id
      LEFT JOIN cornhill_school.academic_grade_bands band
        ON band.scheme_code = v_scheme_code
       AND (band.subject_id IS NULL OR band.subject_id = mark.subject_id)
       AND round(mark.score * 100 / mark.max_score, 2) BETWEEN band.min_percent AND band.max_percent
     WHERE enrolment.class_id = v_assessment.class_id
       AND enrolment.admission_date <= v_assessment.effective_date
       AND (enrolment.exit_date IS NULL OR enrolment.exit_date >= v_assessment.effective_date)
     GROUP BY enrolment.learner_id, mark.subject_id, mark.id
    HAVING count(band.id) <> 1
  ) THEN
    RAISE EXCEPTION 'Each assessment mark must resolve to exactly one configured grade band'
      USING ERRCODE = '23514';
  END IF;

  WITH eligible AS (
    SELECT enrolment.id AS enrolment_period_id, enrolment.learner_id,
           learner.pupil_code, learner.lin, learner.p7_index_number,
           concat_ws(' ', learner.first_name, learner.middle_name, learner.last_name) AS learner_name,
           class.class_code, class.display_name AS class_name
      FROM cornhill_school.enrolment_periods enrolment
      JOIN cornhill_school.learners learner ON learner.id = enrolment.learner_id
      JOIN cornhill_school.classes class ON class.id = enrolment.class_id
     WHERE enrolment.class_id = v_assessment.class_id
       AND enrolment.admission_date <= v_assessment.effective_date
       AND (enrolment.exit_date IS NULL OR enrolment.exit_date >= v_assessment.effective_date)
  ), subject_rows AS (
    SELECT eligible.*, subject.id AS subject_id, subject.subject_code, subject.subject_name,
           class_subject.display_order, mark.score, mark.max_score, mark.teacher_comment,
           round(mark.score * 100 / mark.max_score, 2) AS percent_score,
           band.grade_code, band.grade_point
      FROM eligible
      CROSS JOIN cornhill_school.class_subjects class_subject
      JOIN cornhill_school.subjects subject ON subject.id = class_subject.subject_id
      JOIN cornhill_school.learner_marks mark
        ON mark.learner_id = eligible.learner_id
       AND mark.assessment_id = p_assessment_id
       AND mark.subject_id = subject.id
      JOIN cornhill_school.academic_grade_bands band
        ON band.scheme_code = v_scheme_code
       AND (band.subject_id IS NULL OR band.subject_id = subject.id)
       AND round(mark.score * 100 / mark.max_score, 2) BETWEEN band.min_percent AND band.max_percent
     WHERE class_subject.class_id = v_assessment.class_id
       AND class_subject.is_active = true AND subject.is_active = true
  ), learner_totals AS (
    SELECT learner_id, enrolment_period_id, pupil_code, lin, learner_name,
           p7_index_number, class_code, class_name,
           jsonb_agg(jsonb_build_object(
             'subjectId', subject_id, 'subjectCode', subject_code,
             'subjectName', subject_name, 'score', score, 'maxScore', max_score,
             'percent', percent_score, 'grade', grade_code, 'gradePoint', grade_point,
             'comment', teacher_comment
           ) ORDER BY display_order) AS subject_results,
           sum(score)::numeric(12,2) AS total_score,
           sum(max_score)::numeric(12,2) AS total_possible,
           round(sum(score) * 100 / sum(max_score), 2)::numeric(5,2) AS average_percent,
           CASE WHEN v_uses_aggregates THEN sum(grade_point)::smallint ELSE NULL END AS aggregate_total
      FROM subject_rows
     GROUP BY learner_id, enrolment_period_id, pupil_code, lin, learner_name,
              p7_index_number, class_code, class_name
  ), ranked AS (
    SELECT learner_totals.*,
           rank() OVER (ORDER BY average_percent DESC)::integer AS class_position,
           count(*) OVER ()::integer AS class_size
      FROM learner_totals
  )
  INSERT INTO cornhill_school.academic_report_cards (
    learner_id, assessment_id, academic_year_id, academic_term_id, class_id,
    enrolment_period_id, pupil_code_snapshot, lin_snapshot, learner_name_snapshot,
    p7_index_number_snapshot, class_code_snapshot, class_name_snapshot,
    assessment_name_snapshot, assessment_type_snapshot, assessment_date,
    academic_year_label_snapshot, academic_term_number_snapshot,
    academic_term_name_snapshot, grading_scheme_code, subject_results, total_score, total_possible,
    average_percent, aggregate_total, division_code, class_position, class_size,
    generated_by_staff_id
  )
  SELECT ranked.learner_id, p_assessment_id, v_assessment.academic_year_id,
         v_assessment.academic_term_id, v_assessment.class_id,
         ranked.enrolment_period_id, ranked.pupil_code, ranked.lin,
         ranked.learner_name, ranked.p7_index_number,
         ranked.class_code, ranked.class_name,
         v_assessment.assessment_name, v_assessment.assessment_type,
         v_assessment.effective_date, v_assessment.year_label,
         v_assessment.term_number, v_assessment.term_name,
         v_scheme_code, ranked.subject_results,
         ranked.total_score, ranked.total_possible, ranked.average_percent,
         ranked.aggregate_total, division.division_code,
         ranked.class_position, ranked.class_size, p_actor_staff_id
    FROM ranked
    LEFT JOIN LATERAL (
      SELECT band.division_code
        FROM cornhill_school.academic_division_bands band
       WHERE band.scheme_code = v_scheme_code
         AND ranked.aggregate_total BETWEEN band.min_aggregate AND band.max_aggregate
       ORDER BY band.min_aggregate DESC
       LIMIT 1
    ) division ON true;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  IF v_inserted_count <> v_learner_count THEN
    RAISE EXCEPTION 'Report card batch did not include every eligible learner'
      USING ERRCODE = '23514';
  END IF;
  RETURN v_inserted_count;
END;
$function$;

CREATE FUNCTION cornhill_school.record_learner_progression(
  p_actor_staff_id uuid,
  p_learner_id uuid,
  p_to_class_id uuid,
  p_academic_term_id uuid,
  p_effective_date date,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_learner record;
  v_period record;
  v_destination record;
  v_source_class_code text;
  v_source_class_level smallint;
  v_source_class_id uuid;
  v_progression_type text;
  v_new_period_id uuid;
  v_event_id uuid;
BEGIN
  IF NOT cornhill_school.academic_actor_has_permission(p_actor_staff_id, 'learners.manage') THEN
    RAISE EXCEPTION 'Staff account lacks learner progression permission' USING ERRCODE = '42501';
  END IF;
  IF p_learner_id IS NULL OR p_academic_term_id IS NULL OR p_effective_date IS NULL
     OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 2 AND 300 THEN
    RAISE EXCEPTION 'Learner, academic term, effective date and reason are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT learner.id, learner.class_id, learner.status
    INTO v_learner
    FROM cornhill_school.learners learner
   WHERE learner.id = p_learner_id
   FOR UPDATE;
  IF NOT FOUND OR v_learner.status <> 'Active' OR v_learner.class_id IS NULL THEN
    RAISE EXCEPTION 'Only an active learner with a current class can progress'
      USING ERRCODE = '23514';
  END IF;

  SELECT enrolment.id, enrolment.class_id, enrolment.admission_date
    INTO v_period
    FROM cornhill_school.enrolment_periods enrolment
   WHERE enrolment.learner_id = p_learner_id AND enrolment.status = 'Active'
   FOR UPDATE;
  IF NOT FOUND OR v_period.class_id IS DISTINCT FROM v_learner.class_id
     OR v_period.admission_date > p_effective_date THEN
    RAISE EXCEPTION 'The learner must have one matching active enrolment before the progression date'
      USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM cornhill_school.enrolment_periods enrolment
      WHERE enrolment.learner_id = p_learner_id AND enrolment.status = 'Active') <> 1 THEN
    RAISE EXCEPTION 'The learner must have exactly one active enrolment period'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cornhill_school.academic_terms term
    WHERE term.id = p_academic_term_id
      AND p_effective_date BETWEEN term.starts_on AND term.ends_on
  ) THEN
    RAISE EXCEPTION 'Progression date must fall within the selected academic term'
      USING ERRCODE = '23514';
  END IF;
  SELECT class.class_code, class.level_order
    INTO v_source_class_code, v_source_class_level
    FROM cornhill_school.classes class WHERE class.id = v_learner.class_id;
  v_source_class_id := v_learner.class_id;

  IF p_to_class_id IS NULL THEN
    IF v_source_class_code <> 'P7' THEN
      RAISE EXCEPTION 'Only a P.7 learner can be recorded as completing primary school'
        USING ERRCODE = '23514';
    END IF;
    v_progression_type := 'Completed';
  ELSE
    SELECT class.class_code, class.level_order, class.is_active
      INTO v_destination
      FROM cornhill_school.classes class WHERE class.id = p_to_class_id;
    IF NOT FOUND OR v_destination.is_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'The destination class is not active' USING ERRCODE = '23514';
    END IF;
    IF v_destination.level_order = v_source_class_level THEN
      IF p_to_class_id <> v_learner.class_id THEN
        RAISE EXCEPTION 'A same-level change must use a separate class-transfer workflow'
          USING ERRCODE = '23514';
      END IF;
      v_progression_type := 'Repeated';
    ELSIF v_destination.level_order = v_source_class_level + 1 THEN
      v_progression_type := 'Promoted';
    ELSE
      RAISE EXCEPTION 'Learner progression must stay in the same class or move exactly one class level'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_to_class_id IS NOT NULL AND p_effective_date <= v_period.admission_date THEN
    RAISE EXCEPTION 'A class progression must begin after the current enrolment admission date'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM cornhill_auth.staff_role_assignments assignment
    WHERE assignment.staff_account_id = p_actor_staff_id
      AND assignment.role_code IN ('teacher', 'class_teacher', 'upper_primary_teacher', 'lower_primary_teacher', 'nursery_head')
  ) AND (
    NOT EXISTS (
      SELECT 1 FROM cornhill_auth.staff_class_assignments class_assignment
      WHERE class_assignment.staff_account_id = p_actor_staff_id
        AND class_assignment.class_id = v_source_class_id
        AND class_assignment.is_active = true
    ) OR (p_to_class_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM cornhill_auth.staff_class_assignments class_assignment
      WHERE class_assignment.staff_account_id = p_actor_staff_id
        AND class_assignment.class_id = p_to_class_id
        AND class_assignment.is_active = true
    ))
  ) THEN
    RAISE EXCEPTION 'Staff account cannot progress a learner outside its assigned class scope'
      USING ERRCODE = '42501';
  END IF;

  UPDATE cornhill_school.enrolment_periods
     SET exit_date = CASE
           WHEN p_to_class_id IS NULL THEN p_effective_date
           ELSE p_effective_date - 1
         END,
         status = 'Completed', exit_reason = trim(p_reason)
   WHERE id = v_period.id AND status = 'Active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The learner enrolment could not be closed'
      USING ERRCODE = '23514';
  END IF;

  IF p_to_class_id IS NOT NULL THEN
    INSERT INTO cornhill_school.enrolment_periods
      (learner_id, admission_date, class_id, status, previous_period_id, created_by_staff_id)
    VALUES (p_learner_id, p_effective_date, p_to_class_id, 'Active', v_period.id, p_actor_staff_id)
    RETURNING id INTO v_new_period_id;
    UPDATE cornhill_school.learners
       SET class_id = p_to_class_id, updated_at = now()
     WHERE id = p_learner_id AND status = 'Active';
  ELSE
    UPDATE cornhill_school.learners
       SET status = 'Graduated', updated_at = now()
     WHERE id = p_learner_id AND status = 'Active';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The learner profile could not be updated'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO cornhill_school.learner_progression_events
    (learner_id, from_enrolment_period_id, to_enrolment_period_id,
     from_class_id, to_class_id, academic_term_id, progression_type,
     effective_date, reason, approved_by_staff_id)
  VALUES (p_learner_id, v_period.id, v_new_period_id, v_period.class_id,
          p_to_class_id, p_academic_term_id, v_progression_type,
          p_effective_date, trim(p_reason), p_actor_staff_id)
  RETURNING id INTO v_event_id;

  INSERT INTO cornhill_school.admission_events
    (learner_id, event_code, actor_staff_id, reason, details)
  VALUES (p_learner_id,
          CASE WHEN p_to_class_id IS NULL THEN 'status_changed' ELSE 'class_assigned' END,
          p_actor_staff_id, trim(p_reason),
          jsonb_build_object('progressionEventId', v_event_id,
                             'progressionType', v_progression_type,
                             'fromClassId', v_period.class_id,
                             'toClassId', p_to_class_id,
                             'effectiveDate', p_effective_date));
  RETURN v_event_id;
END;
$function$;

CREATE UNIQUE INDEX one_active_academic_grading_scheme_per_level
  ON cornhill_school.academic_grading_schemes (class_section, first_level, last_level)
  WHERE is_active = true;

REVOKE ALL ON TABLE
  cornhill_school.academic_grading_schemes,
  cornhill_school.academic_grade_bands,
  cornhill_school.academic_division_bands,
  cornhill_school.academic_report_cards,
  cornhill_school.learner_progression_events FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.guard_academic_division_band_overlap() FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.prevent_academic_history_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.academic_actor_has_permission(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.generate_academic_report_cards(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.record_learner_progression(uuid,uuid,uuid,uuid,date,text) FROM PUBLIC;

GRANT SELECT ON cornhill_school.academic_report_cards,
  cornhill_school.learner_progression_events TO cornhill_auth_runtime;
GRANT EXECUTE ON FUNCTION cornhill_school.generate_academic_report_cards(uuid,uuid),
  cornhill_school.record_learner_progression(uuid,uuid,uuid,uuid,date,text)
  TO cornhill_auth_runtime;

COMMIT;
