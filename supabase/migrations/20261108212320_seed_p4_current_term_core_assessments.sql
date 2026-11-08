-- Ensure P4 has its standard four-core-subject assessment columns in the current term.
-- Safe to re-run: the existing assessment unique key prevents duplicate columns.
insert into public.assessments(term_id,class_id,subject_id,title,assessment_type,max_score,assessment_date,created_by)
select t.id,c.id,cs.subject_id,p.title,'Coursework',100,null,'f9aa5308-eebd-45a3-b4b1-22dbd29e834a'::uuid
from public.academic_terms t
join public.school_classes c on c.name='P4'
join public.class_subjects cs on cs.class_id=c.id
join public.subjects s on s.id=cs.subject_id
cross join (values
 ('Beginning Assessment'::text),
 ('Midterm Assessment'::text),
 ('End of Term Assessment'::text)
) as p(title)
where t.is_current=true
  and s.name in ('English','Mathematics','Science','Social Studies')
on conflict (term_id,class_id,subject_id,title) do nothing;
