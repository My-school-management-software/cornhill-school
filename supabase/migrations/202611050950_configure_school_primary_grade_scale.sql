-- Preserve the school's approved P4-P7 subject grading scale.
-- The Excel workbook uses the last digit of each subject grade as its
-- aggregate point, then calculates division from the four subject points.
-- Do not change academic_grade_bands: that separate scale is retained
-- for Nursery / P1-P3 and must not be replaced by D1-F9.

begin;

update public.uneb_subject_grade_bands as g
set min_percent = v.min_percent,
    max_percent = v.max_percent,
    is_active = true,
    updated_at = now()
from (values
  ('D1', 90::numeric, 100::numeric),
  ('D2', 80::numeric, 89::numeric),
  ('C3', 75::numeric, 79::numeric),
  ('C4', 70::numeric, 74::numeric),
  ('C5', 60::numeric, 69::numeric),
  ('C6', 50::numeric, 59::numeric),
  ('P7', 45::numeric, 49::numeric),
  ('P8', 40::numeric, 44::numeric),
  ('F9', 0::numeric, 39::numeric)
) as v(grade_code, min_percent, max_percent)
where g.grade_code = v.grade_code;

commit;
