-- CORNHILL: account-scoped notification read receipts.
create or replace function public.mark_school_notification_read(p_notification_id uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
declare v_role text; v_visible boolean := false;
begin
 if auth.uid() is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 select up.role into v_role
 from public.user_profiles up
 where up.id=auth.uid() and coalesce(up.employment_status,'Active')='Active';
 if v_role is null then raise exception 'An active school account is required' using errcode='42501'; end if;

 select exists (
  select 1 from public.school_notifications n
  where n.id=p_notification_id and n.archived_at is null
    and (n.recipient_user_id=auth.uid()
      or (n.recipient_user_id is null and (
        (coalesce(public.is_school_admin(),false) and (n.audience_role is null or n.audience_role='Admin'))
        or (not coalesce(public.is_school_admin(),false) and n.audience_role=v_role
          and (n.student_id is null or (v_role='Teacher' and exists (
            select 1 from public.students s
            where s.id=n.student_id and s.status<>'Archived'
              and public.is_class_teacher_for_class(s.class_id)
          )))
        )
      )))
 ) into v_visible;
 if not v_visible then
  raise exception 'Notification not found or not available to this account' using errcode='42501';
 end if;
 insert into public.school_notification_user_state(notification_id,user_id,read_at,updated_at)
 values(p_notification_id,auth.uid(),now(),now())
 on conflict(notification_id,user_id) do update
 set read_at=coalesce(public.school_notification_user_state.read_at,excluded.read_at),
     updated_at=now();
end;
$function$;

revoke all on function public.mark_school_notification_read(uuid) from public,anon;
grant execute on function public.mark_school_notification_read(uuid) to authenticated;
