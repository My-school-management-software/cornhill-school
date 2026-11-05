-- Preserve the school's approved D1-F9 percentage grading scale.
-- Nursery continues to use its existing Excellent / Very Good / Good / Fair scale.
-- The D1-F9 ranges apply to P4-P7 subject grading (English, Mathematics,
-- Science and Social Studies) and the shared primary grade-band configuration.

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

update public.academic_grade_bands
set name = case name
    when 'A' then 'D1'
    when 'B' then 'D2'
    when 'C' then 'C3'
    when 'D' then 'C4'
    when 'E' then 'F9'
    else name
  end,
  min_percent = case name
    when 'A' then 90
    when 'B' then 80
    when 'C' then 75
    when 'D' then 70
    when 'E' then 0
    else min_percent
  end,
  max_percent = case name
    when 'A' then 100
    when 'B' then 89
    when 'C' then 79
    when 'D' then 74
    when 'E' then 39
    else max_percent
  end,
  comment = case name
    when 'A' then 'D1'
    when 'B' then 'D2'
    when 'C' then 'C3'
    when 'D' then 'C4'
    when 'E' then 'F9'
    else comment
  end
where name in ('A','B','C','D','E');

insert into public.academic_grade_bands
  (name, min_percent, max_percent, comment, is_active)
select v.name, v.min_percent, v.max_percent, v.name, true
from (values
  ('C5', 60::numeric, 69::numeric),
  ('C6', 50::numeric, 59::numeric),
  ('P7', 45::numeric, 49::numeric),
  ('P8', 40::numeric, 44::numeric)
) as v(name, min_percent, max_percent)
where not exists (
  select 1 from public.academic_grade_bands existing
  where existing.name = v.name
);

commit;
