-- Record administrator review activity without changing bursary approval or notification status.
create table if not exists public.school_bursary_review_audit (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.school_notifications(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('opened','marked_reviewed')),
  created_at timestamptz not null default now()
);

create index if not exists school_bursary_review_audit_notification_idx
  on public.school_bursary_review_audit(notification_id, created_at desc);
create index if not exists school_bursary_review_audit_student_idx
  on public.school_bursary_review_audit(student_id, created_at desc);
create unique index if not exists school_bursary_review_audit_one_check_per_admin_idx
  on public.school_bursary_review_audit(notification_id, actor_user_id)
  where action = 'marked_reviewed';

alter table public.school_bursary_review_audit enable row level security;
revoke all on public.school_bursary_review_audit from public, anon, authenticated;

create or replace function public.record_school_bursary_review_event(
  p_notification_id uuid,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_student_id uuid;
  v_event_id uuid;
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(), false) then
    raise exception 'Only a signed-in school administrator can record a bursary review' using errcode = '42501';
  end if;
  if p_action not in ('opened','marked_reviewed') then
    raise exception 'Unsupported bursary review event';
  end if;

  select n.student_id into v_student_id
  from public.school_notifications n
  where n.id = p_notification_id
    and n.category = 'bursary_review'
    and n.resolved_at is null
    and n.archived_at is null;

  if v_student_id is null then
    raise exception 'The bursary review notification is missing or no longer active';
  end if;

  if p_action = 'marked_reviewed' then
    insert into public.school_bursary_review_audit(notification_id, student_id, actor_user_id, action)
    values (p_notification_id, v_student_id, auth.uid(), p_action)
    on conflict (notification_id, actor_user_id) where action = 'marked_reviewed' do nothing
    returning id into v_event_id;

    if v_event_id is null then
      select a.id into v_event_id
      from public.school_bursary_review_audit a
      where a.notification_id = p_notification_id
        and a.actor_user_id = auth.uid()
        and a.action = 'marked_reviewed'
      limit 1;
    end if;
  else
    insert into public.school_bursary_review_audit(notification_id, student_id, actor_user_id, action)
    values (p_notification_id, v_student_id, auth.uid(), p_action)
    returning id into v_event_id;
  end if;

  return v_event_id;
end;
$fn$;

create or replace function public.list_school_bursary_review_audit(p_notification_id uuid)
returns table (
  id uuid,
  action text,
  actor_name text,
  created_at timestamptz,
  is_current_user boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(), false) then
    raise exception 'Only a signed-in school administrator can view bursary review history' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.school_notifications n
    where n.id = p_notification_id and n.category = 'bursary_review'
  ) then
    raise exception 'Bursary review notification not found';
  end if;

  return query
  select a.id, a.action,
    coalesce(nullif(btrim(up.full_name), ''), 'School administrator')::text,
    a.created_at,
    a.actor_user_id = auth.uid()
  from public.school_bursary_review_audit a
  left join public.user_profiles up on up.id = a.actor_user_id
  where a.notification_id = p_notification_id
  order by a.created_at desc
  limit 30;
end;
$fn$;

revoke all on function public.record_school_bursary_review_event(uuid,text) from public, anon;
revoke all on function public.list_school_bursary_review_audit(uuid) from public, anon;
grant execute on function public.record_school_bursary_review_event(uuid,text) to authenticated;
grant execute on function public.list_school_bursary_review_audit(uuid) to authenticated;
