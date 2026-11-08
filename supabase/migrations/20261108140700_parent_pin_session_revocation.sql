-- CORNHILL: revoke parent learner sessions when guardian credentials or contact identity changes.
create or replace function public.parent_change_guardian_pin(
 p_pupil_code text, p_registered_phone text, p_current_pin text, p_new_pin text
)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare
 v_contact_id uuid; v_hash text; v_locked timestamptz; v_attempts integer; v_now timestamptz := now();
begin
 if coalesce(p_new_pin,'') !~ '^[0-9]{8}$' then raise exception 'New PIN must contain exactly 8 digits'; end if;
 select c.id,c.guardian_pin_hash,c.guardian_pin_locked_until,c.guardian_pin_failed_attempts
 into v_contact_id,v_hash,v_locked,v_attempts
 from public.parent_guardian_contacts c join public.students s on s.id=c.student_id
 where s.id=private.resolve_learner_id_by_code(p_pupil_code)
   and s.status<>'Archived' and c.phone_e164=trim(p_registered_phone) and c.is_active=true
 limit 1 for update of c;
 if v_contact_id is null then return false; end if;
 if v_locked is not null and v_locked>v_now then return false; end if;
 if v_hash is null or p_current_pin is null or extensions.crypt(p_current_pin,v_hash)<>v_hash then
  update public.parent_guardian_contacts
  set guardian_pin_failed_attempts=coalesce(v_attempts,0)+1,
      guardian_pin_locked_until=case when coalesce(v_attempts,0)+1>=5 then v_now+interval '30 minutes' else null end
  where id=v_contact_id;
  insert into public.guardian_pin_audit(contact_id,action)
  values(v_contact_id,case when coalesce(v_attempts,0)+1>=5 then 'locked' else 'failed_attempt' end);
  return false;
 end if;
 update public.parent_guardian_contacts
 set guardian_pin_hash=extensions.crypt(p_new_pin,extensions.gen_salt('bf',10)),
     guardian_pin_changed_at=v_now,guardian_pin_failed_attempts=0,guardian_pin_locked_until=null
 where id=v_contact_id;
 update public.parent_portal_sessions set revoked_at=v_now
 where guardian_contact_id=v_contact_id and revoked_at is null;
 insert into public.guardian_pin_audit(contact_id,action) values(v_contact_id,'changed');
 return true;
end;
$function$;

create or replace function public.parent_reset_guardian_pin(
 p_pupil_code text, p_registered_phone text, p_recovery_code text, p_new_pin text
)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare
 v_contact_id uuid; v_hash text; v_attempts integer; v_locked timestamptz; v_now timestamptz := now();
begin
 if coalesce(p_new_pin,'') !~ '^[0-9]{8}$' then raise exception 'New PIN must contain exactly 8 digits'; end if;
 select c.id,c.guardian_recovery_hash,c.guardian_pin_failed_attempts,c.guardian_pin_locked_until
 into v_contact_id,v_hash,v_attempts,v_locked
 from public.parent_guardian_contacts c join public.students s on s.id=c.student_id
 where s.id=private.resolve_learner_id_by_code(p_pupil_code)
   and s.status<>'Archived' and c.phone_e164=trim(p_registered_phone) and c.is_active=true
 limit 1 for update of c;
 if v_contact_id is null then return false; end if;
 if v_locked is not null and v_locked>v_now then return false; end if;
 if v_hash is null or p_recovery_code is null
    or extensions.crypt(upper(trim(p_recovery_code)),v_hash)<>v_hash then
  update public.parent_guardian_contacts
  set guardian_pin_failed_attempts=coalesce(guardian_pin_failed_attempts,0)+1,
      guardian_pin_locked_until=case when coalesce(guardian_pin_failed_attempts,0)+1>=5 then v_now+interval '30 minutes' else null end
  where id=v_contact_id;
  insert into public.guardian_pin_audit(contact_id,action)
  values(v_contact_id,case when coalesce(v_attempts,0)+1>=5 then 'locked' else 'failed_attempt' end);
  return false;
 end if;
 update public.parent_guardian_contacts
 set guardian_pin_hash=extensions.crypt(p_new_pin,extensions.gen_salt('bf',10)),
     guardian_pin_changed_at=v_now,guardian_pin_failed_attempts=0,guardian_pin_locked_until=null
 where id=v_contact_id;
 update public.parent_portal_sessions set revoked_at=v_now
 where guardian_contact_id=v_contact_id and revoked_at is null;
 insert into public.guardian_pin_audit(contact_id,action) values(v_contact_id,'reset');
 return true;
end;
$function$;

create or replace function public.admin_issue_guardian_pin(p_contact_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
 v_random bigint; v_pin text; v_recovery text := upper(encode(extensions.gen_random_bytes(6),'hex')); v_now timestamptz := now();
begin
 if auth.uid() is null or not public.is_school_admin() then raise exception 'Administrator access required'; end if;
 loop
  v_random := ('x' || encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint;
  exit when v_random < 4200000000;
 end loop;
 v_pin := lpad((v_random % 100000000)::text,8,'0');
 update public.parent_guardian_contacts
 set guardian_pin_hash=extensions.crypt(v_pin,extensions.gen_salt('bf',10)),
     guardian_recovery_hash=extensions.crypt(v_recovery,extensions.gen_salt('bf',10)),
     guardian_pin_issued_at=v_now,guardian_pin_changed_at=null,
     guardian_pin_failed_attempts=0,guardian_pin_locked_until=null
 where id=p_contact_id and is_active=true;
 if not found then raise exception 'Active guardian contact not found'; end if;
 update public.parent_portal_sessions set revoked_at=v_now
 where guardian_contact_id=p_contact_id and revoked_at is null;
 insert into public.guardian_pin_audit(contact_id,action,actor_user_id)
 values(p_contact_id,'issued',auth.uid());
 return jsonb_build_object('pin',v_pin,'recovery_code',v_recovery,'issued_at',v_now);
end;
$function$;

create or replace function public.admin_update_parent_contact(
 p_contact_id uuid,p_guardian_name text,p_relationship text,p_phone_e164 text,p_whatsapp_e164 text,
 p_sms_opt_in boolean,p_whatsapp_opt_in boolean,p_is_active boolean,p_change_reason text
)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare
 v_phone text:=nullif(trim(p_phone_e164),''); v_whatsapp text:=nullif(trim(p_whatsapp_e164),'');
 v_sms_opt_in boolean:=coalesce(p_sms_opt_in,false); v_whatsapp_opt_in boolean:=coalesce(p_whatsapp_opt_in,false);
 v_old_phone text; v_old_active boolean; v_new_active boolean:=coalesce(p_is_active,true);
begin
 if auth.uid() is null or not public.is_school_admin() then raise exception 'Administrator access required'; end if;
 if length(trim(coalesce(p_guardian_name,'')))<2 then raise exception 'Enter the parent or guardian name'; end if;
 if length(trim(coalesce(p_change_reason,'')))<5 then raise exception 'Enter a reason for the contact change'; end if;
 if v_phone is not null and v_phone !~ '^[+]256[0-9]{9}$' then raise exception 'Use a valid Ugandan number in +256 format'; end if;
 if v_whatsapp is not null and v_whatsapp !~ '^[+]256[0-9]{9}$' then raise exception 'Use a valid WhatsApp number in +256 format'; end if;
 if v_sms_opt_in and v_phone is null then raise exception 'A phone number is required before enabling SMS consent'; end if;
 if v_whatsapp_opt_in and v_whatsapp is null then raise exception 'A WhatsApp number is required before enabling WhatsApp consent'; end if;
 select phone_e164,is_active into v_old_phone,v_old_active
 from public.parent_guardian_contacts where id=p_contact_id for update;
 if not found then raise exception 'Parent contact was not found'; end if;
 perform set_config('app.parent_contact_change_reason',trim(p_change_reason),true);
 update public.parent_guardian_contacts
 set guardian_name=trim(p_guardian_name),
     relationship=nullif(trim(coalesce(p_relationship,'')),''),
     phone_e164=v_phone,whatsapp_e164=v_whatsapp,sms_opt_in=v_sms_opt_in,
     whatsapp_opt_in=v_whatsapp_opt_in,is_active=v_new_active
 where id=p_contact_id;
 if v_phone is distinct from v_old_phone or v_new_active is distinct from v_old_active then
  update public.parent_portal_sessions set revoked_at=now()
  where guardian_contact_id=p_contact_id and revoked_at is null;
 end if;
 return true;
end;
$function$;
