-- Authenticated users need table-level privileges in addition to the row-level policies.
-- RLS continues to restrict teachers to their assigned class and private messages to participants.
grant select on table public.students to authenticated;
grant insert, update on table public.staff_direct_messages to authenticated;
