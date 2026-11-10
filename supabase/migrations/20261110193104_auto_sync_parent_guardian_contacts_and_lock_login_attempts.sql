create or replace function private.normalize_ug_phone(p_value text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case
    when regexp_replace(coalesce(p_value,''),'[^0-9+]','','g') ~ '^\\+256[0-9]{9}$'
      then regexp_replace(p_value,'[^0-9+]','','g')
    when regexp_replace(coalesce(p_value,''),'[^0-9]','','g') ~ '^0[0-9]{9}$'
      then '+256'||substr(regexp_replace(p_value,'[^0-9]','','g'),2)
    when regexp_replace(coalesce(p_value,''),'[^0-9]','','g') ~ '^256[0-9]{9}$'
      then '+'||regexp_replace(p_value,'[^0-9]','','g')
    else null
  end;
$function$;

create or replace function public.sync_student_primary_guardian_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_phone text;
  v_whatsapp text;
  v_changed boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_changed :=
      old.guardian_name is distinct from new.guardian_name
      or old.guardian_phone is distinct from new.guardian_phone
      or old.guardian_relationship is distinct from new.guardian_relationship
      or old.guardian_whatsapp_phone is distinct from new.guardian_whatsapp_phone
      or old.archived_at is distinct from new.archived_at
      or old.status is distinct from new.status;
    if not v_changed then
      return new;
    end if;
  end if;

  if new.archived_at is not null or new.status = 'Archived' then
    update public.parent_guardian_contacts
       set is_active = false,
           is_primary = false,
           notes = 'Deactivated automatically because the learner was archived.'
     where student_id = new.id and is_active = true and is_primary = true;
    return new;
  end if;

  v_phone := private.normalize_ug_phone(new.guardian_phone);
  v_whatsapp := private.normalize_ug_phone(new.guardian_whatsapp_phone);

  update public.parent_guardian_contacts
     set is_active = false,
         is_primary = false,
         notes = 'Previous register-based primary contact; replaced after learner-register update.'
   where student_id = new.id
     and is_active = true
     and is_primary = true
     and (v_phone is null or phone_e164 is distinct from v_phone);

  if nullif(trim(coalesce(new.guardian_name,'')),'') is null or v_phone is null then
    return new;
  end if;

  insert into public.parent_guardian_contacts (
    student_id, guardian_name, relationship, phone_e164, whatsapp_e164,
    sms_opt_in, whatsapp_opt_in, is_primary, is_active, notes
  ) values (
    new.id, trim(new.guardian_name),
    nullif(trim(coalesce(new.guardian_relationship,'')),''),
    v_phone, v_whatsapp,
    coalesce(new.guardian_sms_opt_in,false),
    coalesce(new.guardian_whatsapp_opt_in,false),
    true, true,
    'Auto-synced from the learner register; guardian identity/contact should be confirmed by the school.'
  )
  on conflict (student_id, phone_e164) where phone_e164 is not null
  do update set
    guardian_name = excluded.guardian_name,
    relationship = excluded.relationship,
    whatsapp_e164 = excluded.whatsapp_e164,
    sms_opt_in = excluded.sms_opt_in,
    whatsapp_opt_in = excluded.whatsapp_opt_in,
    is_primary = true,
    is_active = true,
    notes = excluded.notes;

  return new;
end;
$function$;

revoke all on function public.sync_student_primary_guardian_contact() from public, anon, authenticated;
revoke all on function private.normalize_ug_phone(text) from public, anon, authenticated;

drop trigger if exists students_sync_primary_guardian_contact on public.students;
create trigger students_sync_primary_guardian_contact
after insert or update of guardian_name, guardian_phone, guardian_relationship,
  guardian_whatsapp_phone, guardian_sms_opt_in, guardian_whatsapp_opt_in,
  archived_at, status
on public.students
for each row execute function public.sync_student_primary_guardian_contact();

alter table private.parent_portal_login_attempts enable row level security;
revoke all on table private.parent_portal_login_attempts from public, anon, authenticated;
grant all on table private.parent_portal_login_attempts to service_role;
