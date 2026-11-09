-- Permit authenticated staff to send private messages to active colleagues.
-- Reuse the narrowly scoped staff directory SECURITY DEFINER RPC so the
-- recipient check can see active staff profiles without widening profile reads.
drop policy if exists staff_direct_messages_send_self on public.staff_direct_messages;

create policy staff_direct_messages_send_self
on public.staff_direct_messages
for insert
to authenticated
with check (
  sender_user_id = (select auth.uid())
  and recipient_user_id in (
    select directory.id
    from public.list_staff_directory() as directory
  )
);
