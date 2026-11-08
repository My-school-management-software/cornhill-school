-- Restore a notification only in the signed-in user's own inbox.
-- The underlying school event remains unchanged and other users' archived state
-- is not affected.
create or replace function public.restore_school_notification(p_notification_id uuid)
returns void
language plpgsql security definer set search_path=''
as $function$
declare v_role text; v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'Sign-in required' using errcode='42501';
  end if;
  select p.role into v_role
  from public.user_profiles p
  where p.id=(select auth.uid())
    and coalesce(p.employment_status,'Active')='Active';
  if v_role is null then
    raise exception 'An active school account is required' using errcode='42501';
  end if;

  update public.school_notification_user_state us
  set archived_at=null,archive_reason=null,updated_at=now()
  where us.notification_id=p_notification_id
    and us.user_id=(select auth.uid())
    and us.archived_at is not null
    and exists (
      select 1 from public.school_notifications n
      where n.id=us.notification_id and n.archived_at is null
    );
  get diagnostics v_updated = row_count;
  if v_updated=0 then
    raise exception 'This notification is not archived in your account or is no longer available' using errcode='P0002';
  end if;
end;
$function$;
revoke all on function public.restore_school_notification(uuid) from public,anon;
grant execute on function public.restore_school_notification(uuid) to authenticated;

create index if not exists school_record_index_expiry_verification_idx
  on public.school_record_index(verification_status,expires_on)
  where expires_on is not null;
create index if not exists school_record_index_created_at_desc_idx
  on public.school_record_index(created_at desc);
