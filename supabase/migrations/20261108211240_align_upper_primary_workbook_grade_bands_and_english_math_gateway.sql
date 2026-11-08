-- Match the school's P4–P7 Excel grade formulas exactly for the four aggregate subjects.
-- Grade bands: D1 89–100, D2 79–88, C3 74–78, C4 69–73,
-- C5 59–68, C6 49–58, P7 44–48, P8 39–43, F9 0–38.
update public.uneb_subject_grade_bands b
set min_percent = case b.grade_code
      when 'D1' then 89 when 'D2' then 79 when 'C3' then 74
      when 'C4' then 69 when 'C5' then 59 when 'C6' then 49
      when 'P7' then 44 when 'P8' then 39 when 'F9' then 0
      else b.min_percent end,
    max_percent = case b.grade_code
      when 'D1' then 100 when 'D2' then 88 when 'C3' then 78
      when 'C4' then 73 when 'C5' then 68 when 'C6' then 58
      when 'P7' then 48 when 'P8' then 43 when 'F9' then 38
      else b.max_percent end,
    updated_at = now()
from public.subjects s
where s.id = b.subject_id
  and s.name in ('English','Mathematics','Science','Social Studies')
  and b.grade_code in ('D1','D2','C3','C4','C5','C6','P7','P8','F9');
