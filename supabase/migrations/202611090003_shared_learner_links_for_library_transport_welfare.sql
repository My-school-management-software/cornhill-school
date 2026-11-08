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

-- Staff borrowers can also reference their own CORNHILL login account.
alter table public.school_library_loans
  add column if not exists borrower_user_id uuid references public.user_profiles(id) on delete set null;
create index if not exists school_library_loans_borrower_user_idx
  on public.school_library_loans(borrower_user_id) where borrower_user_id is not null;

create or replace function public.sync_transport_learner_snapshot()
returns trigger language plpgsql security invoker set search_path=''
as $function$
declare v_name text; v_code text; v_class text;
begin
  if new.student_id is not null then
    select concat_ws(' ',s.first_name,s.middle_name,s.last_name),s.admission_number,coalesce(c.name,'')
      into v_name,v_code,v_class
    from public.students s left join public.school_classes c on c.id=s.class_id
    where s.id=new.student_id and s.status='Active';
    if not found then raise exception 'Select an active learner from the main register'; end if;
    new.learner_name:=v_name; new.learner_code:=v_code; new.class_name:=v_class;
  end if;
  return new;
end;
$function$;

create or replace function public.sync_welfare_learner_snapshot()
returns trigger language plpgsql security invoker set search_path=''
as $function$
declare v_name text; v_code text;
begin
  if new.student_id is not null then
    select concat_ws(' ',s.first_name,s.middle_name,s.last_name),s.admission_number
      into v_name,v_code from public.students s
    where s.id=new.student_id and s.status='Active';
    if not found then raise exception 'Select an active learner from the main register'; end if;
    new.learner_name:=v_name; new.learner_code:=v_code;
  end if;
  return new;
end;
$function$;

create or replace function public.sync_library_learner_snapshot()
returns trigger language plpgsql security invoker set search_path=''
as $function$
declare v_name text; v_code text;
begin
  if new.borrower_type='Learner' then
    if new.student_id is null then raise exception 'Select a learner from the main learner register'; end if;
    select concat_ws(' ',s.first_name,s.middle_name,s.last_name),s.admission_number
      into v_name,v_code from public.students s
    where s.id=new.student_id and s.status='Active';
    if not found then raise exception 'Select an active learner from the main register'; end if;
    new.borrower_name:=v_name; new.borrower_code:=v_code;
  elsif new.borrower_user_id is not null then
    select d.full_name into v_name
      from public.list_staff_directory() d
      where d.id=new.borrower_user_id;
    if not found and new.borrower_user_id=(select auth.uid()) then
      select p.full_name into v_name from public.user_profiles p
      where p.id=(select auth.uid()) and p.employment_status='Active';
    end if;
    if v_name is null then raise exception 'Select an active staff account'; end if;
    new.borrower_name:=v_name;
    new.borrower_code:='STAFF-'||left(new.borrower_user_id::text,8);
  end if;
  return new;
end;
$function$;

drop trigger if exists school_transport_learner_snapshot on public.school_transport_assignments;
create trigger school_transport_learner_snapshot
before insert or update of student_id on public.school_transport_assignments
for each row execute function public.sync_transport_learner_snapshot();
drop trigger if exists school_welfare_learner_snapshot on public.school_welfare_cases;
create trigger school_welfare_learner_snapshot
before insert or update of student_id on public.school_welfare_cases
for each row execute function public.sync_welfare_learner_snapshot();
drop trigger if exists school_library_learner_snapshot on public.school_library_loans;
create trigger school_library_learner_snapshot
before insert or update of student_id,borrower_user_id,borrower_type on public.school_library_loans
for each row execute function public.sync_library_learner_snapshot();

revoke all on function public.sync_transport_learner_snapshot() from public,anon,authenticated;
revoke all on function public.sync_welfare_learner_snapshot() from public,anon,authenticated;
revoke all on function public.sync_library_learner_snapshot() from public,anon,authenticated;

alter table public.school_library_loans
  add constraint school_library_learner_link_required
  check (borrower_type <> 'Learner' or student_id is not null) not valid;
alter table public.school_library_loans validate constraint school_library_learner_link_required;
