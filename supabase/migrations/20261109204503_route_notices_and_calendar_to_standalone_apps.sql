-- Correct notice and calendar notification destinations after the services were split.
update public.school_notifications set action_workspace='notices',
 action_payload=coalesce(action_payload,'{}'::jsonb)||jsonb_build_object('url','https://noticeboard-cornhill-school.vercel.app/apps/notice-board/#notices','workspace','notices','target_id','staff-notice')
where category='staff_notice' and resolved_at is null;
update public.school_notifications set action_workspace='calendar',
 action_payload=coalesce(action_payload,'{}'::jsonb)||jsonb_build_object('url','https://school-calendar-cornhill-school.vercel.app/apps/school-calendar/#calendar','workspace','calendar','target_id','school-calendar')
where category='school_calendar' and resolved_at is null;

create or replace function public.notify_school_staff_notice_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_role text;v_source text;v_severity text;v_updated_at timestamptz;
begin
 if tg_op='DELETE' then
  update public.school_notifications set resolved_at=coalesce(resolved_at,now()) where source_id=old.id and category='staff_notice' and resolved_at is null;return old;
 end if;
 update public.school_notifications set resolved_at=coalesce(resolved_at,now()) where source_id=new.id and category='staff_notice' and resolved_at is null;
 if not new.is_published or new.publish_at>now() or (new.expires_at is not null and new.expires_at<now()) then return new; end if;
 v_severity:=case new.priority when 'Urgent' then 'urgent' when 'Important' then 'warning' else 'info' end;
 v_updated_at:=coalesce(new.updated_at,new.created_at,now());
 foreach v_role in array coalesce(new.audience_roles,array[]::text[]) loop
  if v_role not in ('Admin','Teacher','Staff') then continue; end if;
  v_source:='staff-notice:'||new.id::text||':'||v_role||':'||to_char(v_updated_at at time zone 'UTC','YYYYMMDDHH24MISSMS');
  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,audience_role,action_payload,is_actionable)
  values('staff_notice',v_severity,'Staff notice: '||left(new.title,120),left(new.body,1200),'notices',v_source,new.id,v_role,
   jsonb_build_object('url','https://noticeboard-cornhill-school.vercel.app/apps/notice-board/#notices','workspace','notices','target_id','staff-notice','record_id',new.id),true)
  on conflict(source_key) do nothing;
 end loop;return new;
end;
$function$;
revoke all on function public.notify_school_staff_notice_event() from public,anon,authenticated;

create or replace function public.notify_school_calendar_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_role text;v_source text;v_updated_at timestamptz;v_message text;
begin
 if tg_op='DELETE' then
  update public.school_notifications set resolved_at=coalesce(resolved_at,now()) where source_id=old.id and category='school_calendar' and resolved_at is null;return old;
 end if;
 update public.school_notifications set resolved_at=coalesce(resolved_at,now()) where source_id=new.id and category='school_calendar' and resolved_at is null;
 if not new.is_published then return new; end if;
 v_updated_at:=coalesce(new.updated_at,new.created_at,now());
 v_message:=to_char(new.event_date,'DD Mon YYYY')||
  case when new.start_time is not null then ' · '||to_char(new.start_time,'HH24:MI') else '' end||
  case when new.end_time is not null then '–'||to_char(new.end_time,'HH24:MI') else '' end||
  case when nullif(btrim(new.venue),'') is not null then ' · '||left(new.venue,100) else '' end||
  case when nullif(btrim(new.description),'') is not null then ' · '||left(new.description,500) else '' end;
 foreach v_role in array coalesce(new.audience_roles,array[]::text[]) loop
  if v_role not in ('Admin','Teacher','Staff') then continue; end if;
  v_source:='school-calendar:'||new.id::text||':'||v_role||':'||to_char(v_updated_at at time zone 'UTC','YYYYMMDDHH24MISSMS');
  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,audience_role,action_payload,is_actionable)
  values('school_calendar','info','School calendar: '||left(new.title,120),left(v_message,1200),'calendar',v_source,new.id,v_role,
   jsonb_build_object('url','https://school-calendar-cornhill-school.vercel.app/apps/school-calendar/#calendar','workspace','calendar','target_id','school-calendar','record_id',new.id),true)
  on conflict(source_key) do nothing;
 end loop;return new;
end;
$function$;
revoke all on function public.notify_school_calendar_event() from public,anon,authenticated;
