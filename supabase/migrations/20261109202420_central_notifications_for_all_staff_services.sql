-- CORNHILL central notification event coverage for separately routed school apps.
-- Existing school_notifications table, RLS policies and account-scoped inbox RPCs are retained.

create or replace function public.notify_school_staff_notice_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_role text; v_source text; v_severity text; v_updated_at timestamptz;
begin
 if tg_op='DELETE' then
  update public.school_notifications set resolved_at=coalesce(resolved_at,now())
  where source_id=old.id and category='staff_notice' and resolved_at is null;
  return old;
 end if;
 update public.school_notifications set resolved_at=coalesce(resolved_at,now())
 where source_id=new.id and category='staff_notice' and resolved_at is null;
 if not new.is_published or new.publish_at>now()
    or (new.expires_at is not null and new.expires_at<now()) then return new; end if;
 v_severity:=case new.priority when 'Urgent' then 'urgent' when 'Important' then 'warning' else 'info' end;
 v_updated_at:=coalesce(new.updated_at,new.created_at,now());
 foreach v_role in array coalesce(new.audience_roles,array[]::text[]) loop
  if v_role not in ('Admin','Teacher','Staff') then continue; end if;
  v_source:='staff-notice:'||new.id::text||':'||v_role||':'||
    to_char(v_updated_at at time zone 'UTC','YYYYMMDDHH24MISSMS');
  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,audience_role,action_payload,is_actionable)
  values('staff_notice',v_severity,'Staff notice: '||left(new.title,120),left(new.body,1200),'notices',v_source,new.id,v_role,
    jsonb_build_object('url','https://noticeboard-cornhill-school.vercel.app/apps/notice-board/#notices','workspace','notices','target_id','staff-notice','record_id',new.id),true)
  on conflict(source_key) do nothing;
 end loop;
 return new;
end;
$function$;
drop trigger if exists school_staff_notice_notification on public.school_staff_notices;
create trigger school_staff_notice_notification after insert or update or delete on public.school_staff_notices
for each row execute function public.notify_school_staff_notice_event();
revoke all on function public.notify_school_staff_notice_event() from public,anon,authenticated;

create or replace function public.notify_school_calendar_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_role text; v_source text; v_updated_at timestamptz; v_message text;
begin
 if tg_op='DELETE' then
  update public.school_notifications set resolved_at=coalesce(resolved_at,now())
  where source_id=old.id and category='school_calendar' and resolved_at is null;
  return old;
 end if;
 update public.school_notifications set resolved_at=coalesce(resolved_at,now())
 where source_id=new.id and category='school_calendar' and resolved_at is null;
 if not new.is_published then return new; end if;
 v_updated_at:=coalesce(new.updated_at,new.created_at,now());
 v_message:=to_char(new.event_date,'DD Mon YYYY')||
  case when new.start_time is not null then ' · '||to_char(new.start_time,'HH24:MI') else '' end||
  case when new.end_time is not null then '–'||to_char(new.end_time,'HH24:MI') else '' end||
  case when nullif(btrim(new.venue),'') is not null then ' · '||left(new.venue,100) else '' end||
  case when nullif(btrim(new.description),'') is not null then ' · '||left(new.description,500) else '' end;
 foreach v_role in array coalesce(new.audience_roles,array[]::text[]) loop
  if v_role not in ('Admin','Teacher','Staff') then continue; end if;
  v_source:='school-calendar:'||new.id::text||':'||v_role||':'||
    to_char(v_updated_at at time zone 'UTC','YYYYMMDDHH24MISSMS');
  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,audience_role,action_payload,is_actionable)
  values('school_calendar','info','School calendar: '||left(new.title,120),left(v_message,1200),'calendar',v_source,new.id,v_role,
   jsonb_build_object('url','https://school-calendar-cornhill-school.vercel.app/apps/school-calendar/#calendar','workspace','calendar','target_id','school-calendar','record_id',new.id),true)
  on conflict(source_key) do nothing;
 end loop;
 return new;
end;
$function$;
drop trigger if exists school_calendar_event_notification on public.school_calendar_events;
create trigger school_calendar_event_notification after insert or update or delete on public.school_calendar_events
for each row execute function public.notify_school_calendar_event();
revoke all on function public.notify_school_calendar_event() from public,anon,authenticated;

create or replace function public.notify_staff_communication_post()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_role text; v_roles text[];
begin
 v_roles:=case new.audience when 'admins' then array['Admin']::text[]
   when 'teachers' then array['Teacher']::text[] else array['Admin','Teacher','Staff']::text[] end;
 foreach v_role in array v_roles loop
  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,audience_role,action_payload,is_actionable)
  values('staff_communication','info','New staff communication',
   'A new school-work update is available in the staff communication feed.',
   'communication','staff-post:'||new.id::text||':'||v_role,new.id,v_role,
   jsonb_build_object('url','https://staff-communications-cornhill-school.vercel.app/apps/staff-communications/#staff-feed','workspace','communication','target_id','staff-feed','record_id',new.id),false)
  on conflict(source_key) do nothing;
 end loop;
 return new;
end;
$function$;
drop trigger if exists staff_communication_post_notification on public.staff_communication_posts;
create trigger staff_communication_post_notification after insert on public.staff_communication_posts
for each row execute function public.notify_staff_communication_post();
revoke all on function public.notify_staff_communication_post() from public,anon,authenticated;

create or replace function public.notify_staff_communication_comment()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_author uuid;
begin
 select p.author_user_id into v_author from public.staff_communication_posts p where p.id=new.post_id;
 if v_author is null or v_author=new.author_user_id then return new; end if;
 insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,recipient_user_id,action_payload,is_actionable)
 values('staff_communication_reply','info','A colleague replied to your staff update',
  'A colleague added a reply to a staff update you published.','communication','staff-comment:'||new.id::text,new.post_id,v_author,
  jsonb_build_object('url','https://staff-communications-cornhill-school.vercel.app/apps/staff-communications/#staff-feed','workspace','communication','target_id','staff-feed','record_id',new.post_id),false)
 on conflict(source_key) do nothing;
 return new;
end;
$function$;
drop trigger if exists staff_communication_comment_notification on public.staff_communication_comments;
create trigger staff_communication_comment_notification after insert on public.staff_communication_comments
for each row execute function public.notify_staff_communication_comment();
revoke all on function public.notify_staff_communication_comment() from public,anon,authenticated;

create or replace function public.notify_school_backup_run_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_status text; v_severity text; v_title text; v_message text;
begin
 v_status:=lower(coalesce(new.status,''));
 if v_status not in ('success','failed') then return new; end if;
 if tg_op='UPDATE' and lower(coalesce(old.status,''))=v_status then return new; end if;
 v_severity:=case when v_status='failed' then 'urgent' else 'info' end;
 v_title:=case when v_status='failed' then 'School backup failed' else 'School backup completed' end;
 v_message:=case when v_status='failed'
  then 'A scheduled school backup did not complete successfully. Open System Health & Recovery and review the backup status.'
  else 'A school backup completed. Open System Health & Recovery to review the latest backup and validation status.' end;
 insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,audience_role,action_payload,is_actionable)
 values('backup',v_severity,v_title,v_message,'system_health','backup-run:'||new.id::text||':'||v_status,new.id,'Admin',
  jsonb_build_object('url','https://system-health-cornhill-school.vercel.app/apps/system-health/','workspace','system_health','target_id','backup-activity','record_id',new.id),v_status='failed')
 on conflict(source_key) do nothing;
 return new;
end;
$function$;
drop trigger if exists google_drive_backup_notification on public.google_drive_backup_runs;
create trigger google_drive_backup_notification after insert or update of status on public.google_drive_backup_runs
for each row execute function public.notify_school_backup_run_event();
revoke all on function public.notify_school_backup_run_event() from public,anon,authenticated;

create or replace function public.notify_school_provider_integration_status()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_severity text;
begin
 if new.status is not distinct from old.status then return new; end if;
 v_severity:=case when new.status in ('Disabled','Setup required','Credentials pending') then 'warning' else 'info' end;
 insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,audience_role,action_payload,is_actionable)
 values('provider_integration',v_severity,'School service integration status changed',
  coalesce(new.provider_name,'A school provider')||' is now marked '||new.status||'. Verify the configuration and test the connection before using it.',
  'integrations','provider-integration:'||new.id::text||':'||md5(new.status||':'||coalesce(new.updated_at::text,'')),new.id,'Admin',
  jsonb_build_object('url','https://integrations-cornhill-school.vercel.app/apps/provider-integrations/','workspace','integrations','target_id','provider-integrations','record_id',new.id),true)
 on conflict(source_key) do nothing;
 return new;
end;
$function$;
drop trigger if exists school_provider_integration_notification on public.school_provider_integrations;
create trigger school_provider_integration_notification after update of status on public.school_provider_integrations
for each row execute function public.notify_school_provider_integration_status();
revoke all on function public.notify_school_provider_integration_status() from public,anon,authenticated;

create or replace function public.record_school_system_health_notification(p_checks jsonb)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_auth text; v_database text; v_apps text; v_backup text; v_severity text;
 v_failed text[]:=array[]::text[]; v_bucket bigint; v_source text;
begin
 if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
  raise exception 'Only an authenticated school administrator can record a system-health check' using errcode='42501';
 end if;
 if jsonb_typeof(p_checks)<>'object' then raise exception 'Health-check results must be a JSON object'; end if;
 v_auth:=p_checks->>'auth';v_database:=p_checks->>'database';v_apps:=p_checks->>'apps';v_backup:=p_checks->>'backup';
 if v_auth not in ('connected','failed') or v_database not in ('reachable','failed')
    or v_apps not in ('reachable','failed') or v_backup not in ('available','unavailable') then
  raise exception 'One or more system-health result values are invalid';
 end if;
 if v_auth='failed' then v_failed:=array_append(v_failed,'Authentication'); end if;
 if v_database='failed' then v_failed:=array_append(v_failed,'Database'); end if;
 if v_apps='failed' then v_failed:=array_append(v_failed,'Application registry'); end if;
 if v_backup='unavailable' then v_failed:=array_append(v_failed,'Backup status'); end if;
 if cardinality(v_failed)=0 then
  update public.school_notifications set resolved_at=coalesce(resolved_at,now()) where category='system_health' and resolved_at is null;
  return;
 end if;
 v_severity:=case when v_auth='failed' or v_database='failed' then 'urgent' else 'warning' end;
 v_bucket:=floor(extract(epoch from now())/900)::bigint;v_source:='system-health:'||v_bucket::text;
 insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,audience_role,action_payload,is_actionable)
 values('system_health',v_severity,'CORNHILL system check needs attention',
  'The following checks need review: '||array_to_string(v_failed,', ')||'. Open System Health & Recovery for the current check results.',
  'system_health',v_source,'Admin',
  jsonb_build_object('url','https://system-health-cornhill-school.vercel.app/apps/system-health/','workspace','system_health','target_id','system-health'),true)
 on conflict(source_key) do update set severity=excluded.severity,message=excluded.message,created_at=now(),resolved_at=null,archived_at=null,archive_reason=null;
end;
$function$;
revoke all on function public.record_school_system_health_notification(jsonb) from public,anon;
grant execute on function public.record_school_system_health_notification(jsonb) to authenticated;
