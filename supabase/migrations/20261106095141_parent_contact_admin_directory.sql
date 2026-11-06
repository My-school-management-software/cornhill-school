-- Parent contact administration RPCs and extended audit detail.
alter table public.parent_contact_change_log
 add column if not exists old_guardian_name text,
 add column if not exists new_guardian_name text,
 add column if not exists old_sms_opt_in boolean,
 add column if not exists new_sms_opt_in boolean,
 add column if not exists old_whatsapp_opt_in boolean,
 add column if not exists new_whatsapp_opt_in boolean;
create or replace function public.log_parent_contact_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if tg_op='UPDATE' and (old.guardian_name is distinct from new.guardian_name or old.phone_e164 is distinct from new.phone_e164 or old.whatsapp_e164 is distinct from new.whatsapp_e164 or old.sms_opt_in is distinct from new.sms_opt_in or old.whatsapp_opt_in is distinct from new.whatsapp_opt_in or old.is_active is distinct from new.is_active) then
  insert into public.parent_contact_change_log(contact_id,student_id,changed_by,old_phone_e164,new_phone_e164,old_whatsapp_e164,new_whatsapp_e164,old_guardian_name,new_guardian_name,old_sms_opt_in,new_sms_opt_in,old_whatsapp_opt_in,new_whatsapp_opt_in,change_reason)
  values(new.id,new.student_id,auth.uid(),old.phone_e164,new.phone_e164,old.whatsapp_e164,new.whatsapp_e164,old.guardian_name,new.guardian_name,old.sms_opt_in,new.sms_opt_in,old.whatsapp_opt_in,new.whatsapp_opt_in,coalesce(nullif(current_setting('app.parent_contact_change_reason',true),''),'Contact details/status updated'));
 end if;
 new.updated_at:=now(); return new;
end $$;
revoke all on function public.log_parent_contact_change() from public,anon,authenticated;
create or replace function public.admin_parent_contact_directory()
returns table(contact_id uuid,student_id uuid,learner_name text,pupil_code text,class_name text,guardian_name text,relationship text,phone_e164 text,whatsapp_e164 text,sms_opt_in boolean,whatsapp_opt_in boolean,is_primary boolean,is_active boolean,updated_at timestamptz)
language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not public.is_school_admin() then raise exception 'Administrator access required'; end if;
 return query select c.id,s.id,concat_ws(' ',s.first_name,s.middle_name,s.last_name),s.admission_number,sc.name,c.guardian_name,c.relationship,c.phone_e164,c.whatsapp_e164,c.sms_opt_in,c.whatsapp_opt_in,c.is_primary,c.is_active,c.updated_at
 from public.parent_guardian_contacts c join public.students s on s.id=c.student_id left join public.school_classes sc on sc.id=s.class_id
 order by s.first_name,s.last_name,c.is_primary desc,c.guardian_name;
end $$;
revoke all on function public.admin_parent_contact_directory() from public,anon;
grant execute on function public.admin_parent_contact_directory() to authenticated;
create or replace function public.admin_update_parent_contact(p_contact_id uuid,p_guardian_name text,p_relationship text,p_phone_e164 text,p_whatsapp_e164 text,p_sms_opt_in boolean,p_whatsapp_opt_in boolean,p_is_active boolean,p_change_reason text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_phone text:=nullif(trim(p_phone_e164),''); v_whatsapp text:=nullif(trim(p_whatsapp_e164),'');
begin
 if auth.uid() is null or not public.is_school_admin() then raise exception 'Administrator access required'; end if;
 if length(trim(coalesce(p_guardian_name,'')))<2 then raise exception 'Enter the parent or guardian name'; end if;
 if length(trim(coalesce(p_change_reason,'')))<5 then raise exception 'Enter a reason for the contact change'; end if;
 if v_phone is not null and v_phone !~ '^\\+256[0-9]{9}$' then raise exception 'Use a valid Ugandan number in +256 format'; end if;
 if v_whatsapp is not null and v_whatsapp !~ '^\\+256[0-9]{9}$' then raise exception 'Use a valid WhatsApp number in +256 format'; end if;
 perform set_config('app.parent_contact_change_reason',trim(p_change_reason),true);
 update public.parent_guardian_contacts set guardian_name=trim(p_guardian_name),relationship=nullif(trim(coalesce(p_relationship,'')),''),phone_e164=v_phone,whatsapp_e164=v_whatsapp,sms_opt_in=coalesce(p_sms_opt_in,false),whatsapp_opt_in=coalesce(p_whatsapp_opt_in,false),is_active=coalesce(p_is_active,true) where id=p_contact_id;
 if not found then raise exception 'Parent contact was not found'; end if; return true;
end $$;
revoke all on function public.admin_update_parent_contact(uuid,text,text,text,text,boolean,boolean,boolean,text) from public,anon;
grant execute on function public.admin_update_parent_contact(uuid,text,text,text,text,boolean,boolean,boolean,text) to authenticated;
