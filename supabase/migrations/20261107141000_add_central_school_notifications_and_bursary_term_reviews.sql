-- Central attention feed for administrators and individual staff members.
create table if not exists public.school_notifications (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  severity text not null default 'info' check (severity in ('info','warning','urgent')),
  title text not null,
  message text not null,
  student_id uuid references public.students(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  audience_role text,
  action_workspace text,
  source_key text not null unique,
  source_id uuid,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  archive_reason text
);
create index if not exists school_notifications_active_created_idx on public.school_notifications (created_at desc) where archived_at is null;
create index if not exists school_notifications_student_active_idx on public.school_notifications (student_id, category) where archived_at is null;
alter table public.school_notifications enable row level security;
revoke all on public.school_notifications from public, anon, authenticated;

create or replace function public.list_school_notifications()
returns table (id uuid,category text,severity text,title text,message text,student_id uuid,action_workspace text,created_at timestamptz,source_key text)
language plpgsql security definer set search_path = ''
as $fn$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'Sign-in required' using errcode='42501'; end if;
  select up.role into v_role from public.user_profiles up where up.id=auth.uid();
  if coalesce(public.is_school_admin(),false) then
    return query select n.id,n.category,n.severity,n.title,n.message,n.student_id,n.action_workspace,n.created_at,n.source_key
      from public.school_notifications n where n.archived_at is null
      order by case n.severity when 'urgent' then 0 when 'warning' then 1 else 2 end,n.created_at desc limit 150;
  else
    return query select n.id,n.category,n.severity,n.title,n.message,n.student_id,n.action_workspace,n.created_at,n.source_key
      from public.school_notifications n where n.archived_at is null
        and (n.recipient_user_id=auth.uid() or (n.audience_role is not null and n.audience_role=v_role))
      order by case n.severity when 'urgent' then 0 when 'warning' then 1 else 2 end,n.created_at desc limit 100;
  end if;
end;
$fn$;

create or replace function public.archive_school_notification(p_notification_id uuid,p_reason text default 'Dismissed by user')
returns void language plpgsql security definer set search_path = ''
as $fn$
declare v_row public.school_notifications%rowtype; v_role text;
begin
  if auth.uid() is null then raise exception 'Sign-in required' using errcode='42501'; end if;
  select n.* into v_row from public.school_notifications n where n.id=p_notification_id for update;
  if not found then raise exception 'Notification not found'; end if;
  select up.role into v_role from public.user_profiles up where up.id=auth.uid();
  if not coalesce(public.is_school_admin(),false)
     and v_row.recipient_user_id is distinct from auth.uid()
     and (v_row.audience_role is null or v_row.audience_role is distinct from v_role) then
    raise exception 'You are not allowed to archive this notification' using errcode='42501';
  end if;
  update public.school_notifications set archived_at=now(),archived_by=auth.uid(),
    archive_reason=left(coalesce(nullif(btrim(p_reason),''),'Dismissed by user'),300)
    where id=p_notification_id and archived_at is null;
  if v_row.category='attendance' and v_row.source_id is not null then
    update public.staff_attendance_alerts set status='read'
      where id=v_row.source_id and (staff_user_id=auth.uid() or coalesce(public.is_school_admin(),false));
  end if;
end;
$fn$;

create or replace function public.sync_staff_attendance_notification()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
  insert into public.school_notifications(category,severity,title,message,recipient_user_id,action_workspace,source_key,source_id)
  values('attendance','warning','Staff attendance notice',new.message,new.staff_user_id,'attendance','attendance-alert:'||new.id::text,new.id)
  on conflict (source_key) do nothing;
  return new;
end;
$fn$;
drop trigger if exists staff_attendance_notification_insert on public.staff_attendance_alerts;
create trigger staff_attendance_notification_insert after insert on public.staff_attendance_alerts
for each row execute function public.sync_staff_attendance_notification();

insert into public.school_notifications(category,severity,title,message,recipient_user_id,action_workspace,source_key,source_id,created_at)
select 'attendance','warning','Staff attendance notice',a.message,a.staff_user_id,'attendance','attendance-alert:'||a.id::text,a.id,a.created_at
from public.staff_attendance_alerts a where a.status='unread'
on conflict (source_key) do nothing;

create or replace function public.admin_set_current_academic_term(p_term_id uuid)
returns void language plpgsql security definer set search_path = ''
as $fn$
declare v_year_id uuid; v_start date; v_end date; v_closed boolean; v_previous_term_id uuid; v_term_label text;
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
    raise exception 'Only a signed-in school administrator can change the active term' using errcode='42501';
  end if;
  select id into v_previous_term_id from public.academic_terms where is_current for update;
  select t.academic_year_id,t.starts_on,t.ends_on,t.is_closed,t.name||' '||coalesce(y.name,'')
    into v_year_id,v_start,v_end,v_closed,v_term_label
    from public.academic_terms t left join public.academic_years y on y.id=t.academic_year_id
    where t.id=p_term_id for update of t;
  if not found then raise exception 'Selected term was not found'; end if;
  if v_closed then raise exception 'This term is closed. A closed term cannot be activated'; end if;
  if v_end<current_date then raise exception 'This term end date has passed. Extend the term dates first, or close the term'; end if;
  update public.academic_years set is_current=false where is_current;
  update public.academic_years set is_current=true where id=v_year_id;
  update public.academic_terms set is_current=false where is_current;
  update public.academic_terms set is_current=true where id=p_term_id;
  if v_previous_term_id is not null and v_previous_term_id<>p_term_id then
    insert into public.school_notifications(category,severity,title,message,student_id,audience_role,action_workspace,source_key)
    select 'bursary_review','urgent','Bursary review required for new term',
      'Review this learner’s bursary approval for '||v_term_label||'. Confirm the amount payable and record a new term-specific approval before treating the previous award as renewed.',
      s.id,'Admin','finance','bursary-review:'||s.id::text||':'||p_term_id::text
    from public.students s
    where s.status='Active'
      and (coalesce(s.is_bursary,false) or exists(select 1 from public.learner_bursary_awards a where a.student_id=s.id))
      and not exists(select 1 from public.learner_bursary_awards a where a.student_id=s.id
        and a.effective_from<=v_end and coalesce(a.effective_until,'infinity'::date)>=v_start)
    on conflict (source_key) do nothing;
  end if;
end;
$fn$;

revoke all on function public.list_school_notifications() from public,anon;
revoke all on function public.archive_school_notification(uuid,text) from public,anon;
revoke all on function public.sync_staff_attendance_notification() from public,anon,authenticated;
grant execute on function public.list_school_notifications() to authenticated;
grant execute on function public.archive_school_notification(uuid,text) to authenticated;
