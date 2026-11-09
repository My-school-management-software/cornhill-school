alter table public.students add column if not exists guardian_sms_opt_in boolean not null default false;
create table if not exists public.school_sms_outbox(
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id) on delete restrict,
 payment_id uuid not null unique references public.school_payments(id) on delete restrict,
 recipient_phone text not null,
 message_body text not null,
 status text not null default 'Pending' check(status in ('Pending','Sent','Failed','Cancelled')),
 provider text,
 provider_message_id text,
 attempt_count integer not null default 0 check(attempt_count>=0),
 last_error text,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
alter table public.school_sms_outbox enable row level security;
drop policy if exists "Admins view school SMS outbox" on public.school_sms_outbox;
create policy "Admins view school SMS outbox" on public.school_sms_outbox for select to authenticated using ((select public.is_school_admin()));
revoke all on public.school_sms_outbox from anon,authenticated;
grant select on public.school_sms_outbox to authenticated;
create or replace function public.queue_parent_payment_sms()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_student public.students%rowtype;
begin
 if new.status<>'Posted' then return new; end if;
 select * into v_student from public.students where id=new.student_id;
 if not found or not v_student.guardian_sms_opt_in or nullif(trim(v_student.guardian_phone),'') is null then return new; end if;
 insert into public.school_sms_outbox(student_id,payment_id,recipient_phone,message_body)
 values(new.student_id,new.id,trim(v_student.guardian_phone),
 'Cornhill School: UGX '||to_char(new.amount_ugx,'FM999,999,999,990')||' received for '||v_student.first_name||' '||v_student.last_name||'. Receipt '||new.receipt_no||'. Thank you.')
 on conflict(payment_id) do nothing;
 return new;
end;$$;
revoke all on function public.queue_parent_payment_sms() from public,anon,authenticated;
drop trigger if exists trg_queue_parent_payment_sms on public.school_payments;
create trigger trg_queue_parent_payment_sms after insert on public.school_payments for each row execute function public.queue_parent_payment_sms();