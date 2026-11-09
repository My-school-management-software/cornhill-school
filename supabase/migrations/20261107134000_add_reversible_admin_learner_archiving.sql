alter table public.students
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text,
  add column if not exists archived_previous_status text;

alter table public.students drop constraint if exists students_status_check;
alter table public.students add constraint students_status_check
  check (status = any (array['Active','Inactive','Transferred','Withdrawn','Graduated','Archived']));

create table if not exists public.learner_archive_audit (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  action text not null check (action in ('archived','restored')),
  previous_status text,
  new_status text not null,
  reason text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.learner_archive_audit enable row level security;
revoke all on public.learner_archive_audit from public, anon, authenticated;
grant select, insert on public.learner_archive_audit to service_role;

create or replace function public.admin_set_learner_archived(
  p_student_id uuid,
  p_archived boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_student public.students%rowtype;
  v_old_status text;
  v_new_status text;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_actor is null or not public.is_school_admin() then
    raise exception 'Only school administrators may archive or restore learner records'
      using errcode = '42501';
  end if;
  if p_student_id is null or p_archived is null then
    raise exception 'A learner and archive action are required' using errcode = '22023';
  end if;
  if v_reason is null or length(v_reason) < 5 or length(v_reason) > 500 then
    raise exception 'Enter a reason between 5 and 500 characters' using errcode = '22023';
  end if;

  select * into v_student from public.students where id = p_student_id for update;
  if not found then
    raise exception 'Learner record not found' using errcode = 'P0002';
  end if;

  v_old_status := v_student.status;
  if p_archived then
    if v_student.status = 'Archived' then
      raise exception 'This learner is already archived' using errcode = '22023';
    end if;
    v_new_status := 'Archived';
    update public.students
       set archived_previous_status = v_student.status,
           archived_at = now(), archived_by = v_actor,
           archive_reason = v_reason, status = 'Archived'
     where id = p_student_id;
  else
    if v_student.status <> 'Archived' then
      raise exception 'This learner is not archived' using errcode = '22023';
    end if;
    v_new_status := coalesce(nullif(v_student.archived_previous_status,''), 'Active');
    if v_new_status = 'Archived' then v_new_status := 'Active'; end if;
    update public.students
       set status = v_new_status, archived_at = null, archived_by = null,
           archive_reason = null, archived_previous_status = null
     where id = p_student_id;
  end if;

  insert into public.learner_archive_audit
    (student_id, action, previous_status, new_status, reason, actor_id)
  values
    (p_student_id, case when p_archived then 'archived' else 'restored' end,
     v_old_status, v_new_status, v_reason, v_actor);

  return jsonb_build_object('student_id', p_student_id,
    'action', case when p_archived then 'archived' else 'restored' end,
    'previous_status', v_old_status, 'new_status', v_new_status);
end;
$function$;

revoke all on function public.admin_set_learner_archived(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_learner_archived(uuid, boolean, text) to authenticated;
