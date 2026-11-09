-- Route new parent/guardian messages into the central attention feed without copying private message content.
create or replace function public.sync_parent_message_notification()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare v_title text; v_message text; v_audience text;
begin
  v_title := case new.category
    when 'issue' then 'Parent or guardian issue needs attention'
    when 'question' then 'Parent or guardian question received'
    when 'feedback' then 'Parent or guardian feedback received'
    else 'New parent or guardian message'
  end;
  v_message := 'A parent or guardian sent a new '||replace(new.category,'_',' ')||'. Open Communications Centre to review and respond.';
  v_audience := case when new.recipient_kind='administration' then 'Admin' else null end;
  insert into public.school_notifications(category,severity,title,message,student_id,recipient_user_id,audience_role,action_workspace,source_key,source_id)
  values('parent_message','warning',v_title,v_message,new.student_id,new.recipient_user_id,v_audience,'communication','parent-message:'||new.id::text,new.id)
  on conflict(source_key) do nothing;
  return new;
end;
$fn$;
drop trigger if exists parent_school_message_notification_insert on public.parent_school_messages;
create trigger parent_school_message_notification_insert after insert on public.parent_school_messages
for each row execute function public.sync_parent_message_notification();
revoke all on function public.sync_parent_message_notification() from public,anon,authenticated;
