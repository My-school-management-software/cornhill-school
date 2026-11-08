-- CORNHILL: link learner-facing service records to the canonical learner register.
-- Existing name/code fields remain as human-readable historical snapshots.
alter table public.school_transport_assignments
  add column if not exists student_id uuid references public.students(id) on delete restrict;
alter table public.school_library_loans
  add column if not exists student_id uuid references public.students(id) on delete restrict;
alter table public.school_welfare_cases
  add column if not exists student_id uuid references public.students(id) on delete restrict;

create index if not exists school_transport_assignments_student_idx
  on public.school_transport_assignments(student_id) where student_id is not null;
create index if not exists school_library_loans_student_idx
  on public.school_library_loans(student_id) where student_id is not null;
create index if not exists school_welfare_cases_student_idx
  on public.school_welfare_cases(student_id) where student_id is not null;

-- Only active authorised transport, library and welfare job titles gain access
-- to the minimum active learner identity fields already granted to authenticated.
-- RLS still filters to active learner records; no guardian/private profile fields
-- are added to the view.
drop policy if exists "Authorised operators read active learner identity for services" on public.students;
create policy "Authorised operators read active learner identity for services"
on public.students for select to authenticated
using (
  status = 'Active'
  and exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid())
      and p.employment_status = 'Active'
      and lower(btrim(coalesce(p.job_title,''))) = any(array[
        'transport manager','transport officer','driver','bus driver',
        'librarian','library manager','library officer',
        'matron','senior woman','senior man','school nurse'
      ])
  )
);

create or replace view public.school_service_learners
with (security_invoker = true)
as
select s.id,s.admission_number,s.first_name,s.middle_name,s.last_name,
       s.class_id,c.name as class_name,s.status
from public.students s
left join public.school_classes c on c.id=s.class_id
where s.status='Active';

grant select on public.school_service_learners to authenticated;
