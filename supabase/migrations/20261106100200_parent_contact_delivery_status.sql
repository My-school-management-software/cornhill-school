-- Include latest recorded SMS and WhatsApp delivery states in the admin-only guardian directory.
drop function if exists public.admin_parent_contact_directory();
create function public.admin_parent_contact_directory()
returns table(contact_id uuid,student_id uuid,learner_name text,pupil_code text,class_name text,guardian_name text,relationship text,phone_e164 text,whatsapp_e164 text,sms_opt_in boolean,whatsapp_opt_in boolean,is_primary boolean,is_active boolean,updated_at timestamptz,last_sms_status text,last_whatsapp_status text,last_message_at timestamptz)
language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not public.is_school_admin() then raise exception 'Administrator access required'; end if;
 return query
 select c.id,s.id,concat_ws(' ',s.first_name,s.middle_name,s.last_name),s.admission_number,sc.name,c.guardian_name,c.relationship,c.phone_e164,c.whatsapp_e164,c.sms_opt_in,c.whatsapp_opt_in,c.is_primary,c.is_active,c.updated_at,
 (select o.status from public.communication_outbox o where o.learner_id=s.id and o.recipient_phone=c.phone_e164 and o.recipient_type='parent' and o.channel='sms' order by o.created_at desc limit 1),
 (select o.status from public.communication_outbox o where o.learner_id=s.id and o.recipient_phone=c.whatsapp_e164 and o.recipient_type='parent' and o.channel='whatsapp' order by o.created_at desc limit 1),
 (select max(o.created_at) from public.communication_outbox o where o.learner_id=s.id and o.recipient_type='parent' and o.recipient_phone in (c.phone_e164,c.whatsapp_e164))
 from public.parent_guardian_contacts c join public.students s on s.id=c.student_id left join public.school_classes sc on sc.id=s.class_id
 order by s.first_name,s.last_name,c.is_primary desc,c.guardian_name;
end $$;
revoke all on function public.admin_parent_contact_directory() from public,anon;
grant execute on function public.admin_parent_contact_directory() to authenticated;
