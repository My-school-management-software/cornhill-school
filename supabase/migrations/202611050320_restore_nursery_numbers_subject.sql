-- Numbers is an approved Nursery subject for Baby, Middle and Top.
-- Restore the class mappings removed by the earlier six-subject alignment.
insert into public.class_subjects (class_id, subject_id)
select c.id, s.id
from public.school_classes c
cross join public.subjects s
where c.name in ('Baby', 'Middle', 'Top')
  and s.name = 'Numbers'
  and not exists (
    select 1
    from public.class_subjects existing
    where existing.class_id = c.id
      and existing.subject_id = s.id
  );
