import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareTransactionalMigration } from "../src/db/migrations.mjs";

const source = await readFile(new URL("../migrations/095_local_academic_results_and_progression.sql", import.meta.url), "utf8");

test("academic history migration is additive and transactional", () => {
  assert.doesNotThrow(() => prepareTransactionalMigration(source));
  assert.match(source, /CREATE TABLE cornhill_school\.academic_report_cards/);
  assert.match(source, /CREATE TABLE cornhill_school\.learner_progression_events/);
  assert.match(source, /CREATE TABLE cornhill_school\.academic_grading_schemes/);
  assert.match(source, /CREATE TABLE cornhill_school\.academic_grade_bands/);
  assert.match(source, /CREATE TABLE cornhill_school\.academic_division_bands/);
  assert.doesNotMatch(source, /\b(?:DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i);
  assert.doesNotMatch(source, /\bALTER\s+TABLE\s+cornhill_school\.(?:learners|enrolment_periods|assessments|learner_marks)\b/i);
});

test("report-card snapshots preserve learner, class, academic period and marks", () => {
  for (const field of [
    "pupil_code_snapshot", "lin_snapshot", "learner_name_snapshot", "p7_index_number_snapshot",
    "class_code_snapshot", "class_name_snapshot", "academic_year_label_snapshot",
    "academic_term_number_snapshot", "academic_term_name_snapshot", "subject_results",
    "total_score", "total_possible", "average_percent", "aggregate_total", "division_code",
    "class_position", "class_size", "generated_by_staff_id"
  ]) assert.match(source, new RegExp("\\b" + field + "\\b"));
  assert.match(source, /UNIQUE \(assessment_id, learner_id\)/);
  assert.match(source, /BEFORE UPDATE OR DELETE ON cornhill_school\.academic_report_cards/);
  assert.match(source, /assessment\.status <> 'Published'/);
  assert.match(source, /Every enrolled learner must have a mark for every active class subject/);
  assert.match(source, /rank\(\) OVER \(ORDER BY average_percent DESC\)/);
});

test("configured CORNHILL grading scales keep Nursery, P.1–P.3 and P.4–P.7 separate", () => {
  assert.match(source, /\('nursery_ae',[\s\S]*?'Nursery', 1, 3, false\)/);
  assert.match(source, /\('lower_primary_ae',[\s\S]*?'Primary', 4, 6, false\)/);
  assert.match(source, /\('upper_primary_uneb',[\s\S]*?'Primary', 7, 10, true\)/);
  assert.match(source, /\('D1', 89\.00::numeric, 100\.00::numeric, 1::smallint\)/);
  assert.match(source, /\('D2', 79\.00::numeric, 88\.99::numeric, 2::smallint\)/);
  assert.match(source, /\('F9', 0\.00::numeric, 38\.99::numeric, 9::smallint\)/);
  assert.match(source, /P\.4–P\.7 results require the four configured core aggregate subjects/);
  assert.doesNotMatch(source, /INSERT INTO cornhill_school\.academic_division_bands/i,
    "Division thresholds must not be invented where no verified school rule is stored.");
});

test("progression is permission checked, atomic, class ordered and append-only", () => {
  assert.match(source, /academic_actor_has_permission\(p_actor_staff_id, 'learners\.manage'\)/);
  assert.match(source, /p_effective_date BETWEEN term\.starts_on AND term\.ends_on/);
  assert.match(source, /p_effective_date <= v_period\.admission_date/);
  assert.match(source, /ELSE p_effective_date - 1/);
  assert.match(source, /v_destination\.level_order = v_source_class_level \+ 1/);
  assert.match(source, /Only a P\.7 learner can be recorded as completing primary school/);
  assert.match(source, /previous_period_id, created_by_staff_id/);
  assert.match(source, /SET status = 'Graduated'/);
  assert.match(source, /BEFORE UPDATE OR DELETE ON cornhill_school\.learner_progression_events/);
  assert.match(source, /GRANT EXECUTE ON FUNCTION cornhill_school\.generate_academic_report_cards/);
  assert.match(source, /GRANT EXECUTE ON FUNCTION cornhill_school\.generate_academic_report_cards\(uuid,uuid\),[\s\S]*?TO cornhill_auth_runtime/);
  assert.doesNotMatch(source, /GRANT INSERT[^;]*academic_report_cards/i);
  assert.doesNotMatch(source, /GRANT INSERT[^;]*learner_progression_events/i);
});
