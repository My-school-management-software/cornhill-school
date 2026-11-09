-- Match the CORNHILL P5/P6/P7 workbook thresholds exactly for the four P4-P7 aggregate subjects.
-- The minimum cutoffs remain 89, 79, 74, 69, 59, 49, 44, 39 and 0.
-- Two-decimal ceilings avoid gaps between neighbouring grades.
update public.uneb_subject_grade_bands b
set max_percent = case b.grade_code
  when 'D1' then 100.00
  when 'D2' then 88.99
  when 'C3' then 78.99
  when 'C4' then 73.99
  when 'C5' then 68.99
  when 'C6' then 58.99
  when 'P7' then 48.99
  when 'P8' then 43.99
  when 'F9' then 38.99
end,
updated_at = now()
where b.is_active = true
  and b.grade_code in ('D1','D2','C3','C4','C5','C6','P7','P8','F9')
  and b.subject_id in (
    select s.id from public.subjects s
    where lower(s.name) in ('english','mathematics','science','social studies')
  );

do $$
declare n integer;
begin
  select count(*) into n
  from public.uneb_subject_grade_bands b
  join public.subjects s on s.id=b.subject_id
  where b.is_active = true
    and lower(s.name) in ('english','mathematics','science','social studies')
    and b.grade_code in ('D1','D2','C3','C4','C5','C6','P7','P8','F9');
  if n <> 36 then
    raise exception 'Expected 36 active core-subject grade bands after workbook alignment; found %.', n;
  end if;
end $$;
