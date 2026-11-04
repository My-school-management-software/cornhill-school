-- Track learner transfers, withdrawals, inactivity and graduation.
alter table public.students drop constraint if exists students_status_check;
alter table public.students add constraint students_status_check check (status in ('Active','Inactive','Transferred','Withdrawn','Graduated'));
create table if not exists public.student_status_history (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id) on delete restrict,
 old_status text not null check (old_status in ('Active','Inactive','Transferred','Withdrawn','Graduated')),
 new_status text not null check (new_status in ('Active','Inactive','Transferred','Withdrawn','Graduated')),
 effective_date date not null default (timezone('Africa/Kampala',now()))::date,
 changed_by uuid references auth.users(id),
 changed_at timestamptz not null default now(),
 constraint student_status_history_changed check (old_status<>new_status)
);
create index if not exists student_status_history_student_date_idx on public.student_status_history(student_id,effective_date desc,changed_at desc);
alter table public.student_status_history enable row level security;
revoke all on public.student_status_history from anon,authenticated;
grant select,insert on public.student_status_history to authenticated;
drop policy if exists "Admins read learner status history" on public.student_status_history;
create policy "Admins read learner status history" on public.student_status_history for select to authenticated using (public.is_school_admin());
drop policy if exists "Admins record learner status history" on public.student_status_history;
create policy "Admins record learner status history" on public.student_status_history for insert to authenticated with check (public.is_school_admin() and changed_by is not distinct from (select auth.uid()));
create or replace function public.log_learner_status_change() returns trigger language plpgsql security invoker set search_path=public,auth as $$
begin
 if old.status is distinct from new.status then
  insert into public.student_status_history(student_id,old_status,new_status,changed_by) values(new.id,old.status,new.status,(select auth.uid()));
 end if;
 return new;
end; $$;
drop trigger if exists students_log_status_change on public.students;
create trigger students_log_status_change after update of status on public.students for each row execute function public.log_learner_status_change();
comment on table public.student_status_history is 'Audit trail for learner status changes including transfers, withdrawals and graduation.';
