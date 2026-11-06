alter table public.parent_guardian_contacts
  add constraint parent_guardian_contacts_sms_requires_phone
    check (not sms_opt_in or phone_e164 is not null),
  add constraint parent_guardian_contacts_whatsapp_requires_number
    check (not whatsapp_opt_in or whatsapp_e164 is not null);

create unique index parent_guardian_contacts_one_active_primary_per_learner
  on public.parent_guardian_contacts(student_id)
  where is_active = true and is_primary = true;

alter table public.parent_contact_change_log
  add column if not exists old_relationship text,
  add column if not exists new_relationship text,
  add column if not exists old_is_active boolean,
  add column if not exists new_is_active boolean,
  add column if not exists old_is_primary boolean,
  add column if not exists new_is_primary boolean;

create or replace function public.log_parent_contact_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE' and (
    old.guardian_name is distinct from new.guardian_name
    or old.relationship is distinct from new.relationship
    or old.phone_e164 is distinct from new.phone_e164
    or old.whatsapp_e164 is distinct from new.whatsapp_e164
    or old.sms_opt_in is distinct from new.sms_opt_in
    or old.whatsapp_opt_in is distinct from new.whatsapp_opt_in
    or old.is_active is distinct from new.is_active
    or old.is_primary is distinct from new.is_primary
  ) then
    insert into public.parent_contact_change_log(
      contact_id, student_id, changed_by,
      old_phone_e164, new_phone_e164,
      old_whatsapp_e164, new_whatsapp_e164,
      old_guardian_name, new_guardian_name,
      old_relationship, new_relationship,
      old_sms_opt_in, new_sms_opt_in,
      old_whatsapp_opt_in, new_whatsapp_opt_in,
      old_is_active, new_is_active,
      old_is_primary, new_is_primary,
      change_reason
    ) values (
      new.id, new.student_id, auth.uid(),
      old.phone_e164, new.phone_e164,
      old.whatsapp_e164, new.whatsapp_e164,
      old.guardian_name, new.guardian_name,
      old.relationship, new.relationship,
      old.sms_opt_in, new.sms_opt_in,
      old.whatsapp_opt_in, new.whatsapp_opt_in,
      old.is_active, new.is_active,
      old.is_primary, new.is_primary,
      coalesce(nullif(current_setting('app.parent_contact_change_reason', true), ''), 'Contact details/status updated')
    );
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.admin_update_parent_contact(
  p_contact_id uuid,
  p_guardian_name text,
  p_relationship text,
  p_phone_e164 text,
  p_whatsapp_e164 text,
  p_sms_opt_in boolean,
  p_whatsapp_opt_in boolean,
  p_is_active boolean,
  p_change_reason text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_phone text := nullif(trim(p_phone_e164),'');
  v_whatsapp text := nullif(trim(p_whatsapp_e164),'');
  v_sms_opt_in boolean := coalesce(p_sms_opt_in,false);
  v_whatsapp_opt_in boolean := coalesce(p_whatsapp_opt_in,false);
begin
  if auth.uid() is null or not public.is_school_admin() then
    raise exception 'Administrator access required';
  end if;
  if length(trim(coalesce(p_guardian_name,''))) < 2 then
    raise exception 'Enter the parent or guardian name';
  end if;
  if length(trim(coalesce(p_change_reason,''))) < 5 then
    raise exception 'Enter a reason for the contact change';
  end if;
  if v_phone is not null and v_phone !~ '^\+256[0-9]{9}$' then
    raise exception 'Use a valid Ugandan number in +256 format';
  end if;
  if v_whatsapp is not null and v_whatsapp !~ '^\+256[0-9]{9}$' then
    raise exception 'Use a valid WhatsApp number in +256 format';
  end if;
  if v_sms_opt_in and v_phone is null then
    raise exception 'A phone number is required before enabling SMS consent';
  end if;
  if v_whatsapp_opt_in and v_whatsapp is null then
    raise exception 'A WhatsApp number is required before enabling WhatsApp consent';
  end if;

  perform set_config('app.parent_contact_change_reason',trim(p_change_reason),true);
  update public.parent_guardian_contacts
  set guardian_name=trim(p_guardian_name),
      relationship=nullif(trim(coalesce(p_relationship,'')),''),
      phone_e164=v_phone,
      whatsapp_e164=v_whatsapp,
      sms_opt_in=v_sms_opt_in,
      whatsapp_opt_in=v_whatsapp_opt_in,
      is_active=coalesce(p_is_active,true)
  where id=p_contact_id;
  if not found then
    raise exception 'Parent contact was not found';
  end if;
  return true;
end;
$function$;

revoke all on function public.log_parent_contact_change() from public, anon, authenticated;
revoke all on function public.admin_update_parent_contact(uuid,text,text,text,text,boolean,boolean,boolean,text) from public, anon;
grant execute on function public.admin_update_parent_contact(uuid,text,text,text,text,boolean,boolean,boolean,text) to authenticated;
