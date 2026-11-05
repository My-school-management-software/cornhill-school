-- Only signed-in participants may read and create call signals. Signals are immutable after insert.
revoke all privileges on table public.staff_call_signals from anon, authenticated;
revoke all privileges (id, call_id, sender_user_id, recipient_user_id, signal_type, payload, created_at)
on table public.staff_call_signals from anon, authenticated;
grant select on table public.staff_call_signals to authenticated;
grant insert (call_id, sender_user_id, recipient_user_id, signal_type, payload)
on table public.staff_call_signals to authenticated;
