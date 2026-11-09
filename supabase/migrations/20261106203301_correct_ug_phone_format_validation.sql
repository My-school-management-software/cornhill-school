alter table public.parent_guardian_contacts
  drop constraint if exists parent_guardian_contacts_phone_format,
  drop constraint if exists parent_guardian_contacts_whatsapp_format;

alter table public.parent_guardian_contacts
  add constraint parent_guardian_contacts_phone_format
    check (phone_e164 is null or phone_e164 ~ '^\+256[0-9]{9}$'),
  add constraint parent_guardian_contacts_whatsapp_format
    check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+256[0-9]{9}$');

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

revoke all on function public.admin_update_parent_contact(uuid,text,text,text,text,boolean,boolean,boolean,text) from public, anon;
grant execute on function public.admin_update_parent_contact(uuid,text,text,text,text,boolean,boolean,boolean,text) to authenticated;
