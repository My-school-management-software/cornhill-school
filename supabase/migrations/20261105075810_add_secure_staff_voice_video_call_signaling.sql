-- Private WebRTC signalling for staff-to-staff voice and video calls.
create table if not exists public.staff_call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  sender_user_id uuid not null references public.user_profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.user_profiles(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer','answer','ice','decline','end')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists staff_call_signals_call_created_idx
  on public.staff_call_signals(call_id, created_at);
create index if not exists staff_call_signals_recipient_created_idx
  on public.staff_call_signals(recipient_user_id, created_at desc);
alter table public.staff_call_signals enable row level security;
drop policy if exists staff_call_signals_read_participant on public.staff_call_signals;
create policy staff_call_signals_read_participant
  on public.staff_call_signals for select to authenticated
  using (sender_user_id=(select auth.uid()) or recipient_user_id=(select auth.uid()));
drop policy if exists staff_call_signals_send_self on public.staff_call_signals;
create policy staff_call_signals_send_self
  on public.staff_call_signals for insert to authenticated
  with check (
    sender_user_id=(select auth.uid())
    and recipient_user_id<>(select auth.uid())
    and recipient_user_id in (select d.id from public.list_staff_directory() d)
  );
revoke all privileges on table public.staff_call_signals from anon, authenticated;
revoke all privileges (id, call_id, sender_user_id, recipient_user_id, signal_type, payload, created_at)
  on table public.staff_call_signals from anon, authenticated;
grant select on table public.staff_call_signals to authenticated;
grant insert (call_id, sender_user_id, recipient_user_id, signal_type, payload)
  on table public.staff_call_signals to authenticated;
