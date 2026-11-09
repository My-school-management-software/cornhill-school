-- Staff can send and read their own messages. Recipients may update only read_at.
-- Column-level grants prevent either participant from rewriting message identity or body.
revoke all privileges on table public.staff_direct_messages from anon, authenticated;
grant select on table public.staff_direct_messages to authenticated;
grant insert (sender_user_id, recipient_user_id, body) on table public.staff_direct_messages to authenticated;
grant update (read_at) on table public.staff_direct_messages to authenticated;

drop policy if exists staff_direct_messages_mark_read on public.staff_direct_messages;
create policy staff_direct_messages_mark_read
on public.staff_direct_messages
for update
to authenticated
using (recipient_user_id = (select auth.uid()))
with check (
  recipient_user_id = (select auth.uid())
  and sender_user_id <> (select auth.uid())
  and read_at is not null
);