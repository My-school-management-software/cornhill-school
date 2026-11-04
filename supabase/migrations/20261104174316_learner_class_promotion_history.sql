-- Auditable learner class promotion and transfer history.
create table if not exists public.student_class_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  from_class_id uuid references public.school_classes(id) on delete set null,
  to_class_id uuid not null references public.school_classes(id) on delete restrict,
  effective_date date not null default (timezone('Africa/Kampala', now()))::date,
  notes text,
  changed_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  constraint student_class_history_different_class check (from_class_id is distinct from to_class_id)
);
create index if not exists student_class_history_student_date_idx
  on public.student_class_history(student_id, effective_date desc, created_at desc);
alter table public.student_class_history enable row level security;
revoke all on public.student_class_history from anon, authenticated;
grant select, insert on public.student_class_history to authenticated;
drop policy if exists "Admins read learner class history" on public.student_class_history;
create policy "Admins read learner class history" on public.student_class_history for select to authenticated using (public.is_school_admin());
drop policy if exists "Admins record learner class history" on public.student_class_history;
create policy "Admins record learner class history" on public.student_class_history for insert to authenticated with check (public.is_school_admin() and changed_by = (select auth.uid()));
create or replace function public.promote_learner(
  p_student_id uuid, p_new_class_id uuid,
  p_effective_date date default (timezone('Africa/Kampala', now()))::date,
  p_notes text default null
) returns uuid language plpgsql security invoker set search_path = public, auth as $$
declare v_old_class_id uuid; v_history_id uuid;
begin
  if not public.is_school_admin() then raise exception 'Only the school administrator can promote learners'; end if;
  if p_effective_date is null then raise exception 'An effective promotion date is required'; end if;
  perform 1 from public.school_classes where id = p_new_class_id;
  if not found then raise exception 'The destination class does not exist'; end if;
  select class_id into v_old_class_id from public.students where id = p_student_id for update;
  if not found then raise exception 'Learner record not found'; end if;
  if v_old_class_id is not distinct from p_new_class_id then raise exception 'The learner is already assigned to that class'; end if;
  insert into public.student_class_history(student_id,from_class_id,to_class_id,effective_date,notes,changed_by)
  values(p_student_id,v_old_class_id,p_new_class_id,p_effective_date,nullif(btrim(p_notes),''),(select auth.uid()))
  returning id into v_history_id;
  update public.students set class_id=p_new_class_id where id=p_student_id;
  return v_history_id;
end; $$;
revoke all on function public.promote_learner(uuid,uuid,date,text) from public, anon;
grant execute on function public.promote_learner(uuid,uuid,date,text) to authenticated;
comment on table public.student_class_history is 'Auditable learner class promotion and transfer history.';
