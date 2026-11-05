alter table public.students alter column gender drop not null;
alter table public.students add column if not exists admission_complete boolean not null default true;
create index if not exists staff_direct_messages_unread_recipient_idx
on public.staff_direct_messages(recipient_user_id, created_at desc)
where read_at is null;