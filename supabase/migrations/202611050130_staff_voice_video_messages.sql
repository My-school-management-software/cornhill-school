-- Staff voice notes and short video messages.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-media', 'staff-media', false, 20971520,
  array['audio/webm','audio/mp4','audio/ogg','audio/mpeg','video/webm','video/mp4','video/quicktime'])
on conflict (id) do update set public=false, file_size_limit=20971520, allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.staff_media_messages (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('audio','video')),
  storage_path text not null unique,
  mime_type text not null,
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 180),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint staff_media_not_self check (sender_user_id <> recipient_user_id)
);
create index if not exists staff_media_conversation_idx on public.staff_media_messages(sender_user_id, recipient_user_id, created_at);
create index if not exists staff_media_recipient_idx on public.staff_media_messages(recipient_user_id, created_at desc);
alter table public.staff_media_messages enable row level security;
drop policy if exists staff_media_read_participant on public.staff_media_messages;
create policy staff_media_read_participant on public.staff_media_messages for select to authenticated
using (sender_user_id=(select auth.uid()) or recipient_user_id=(select auth.uid()));
drop policy if exists staff_media_send_self on public.staff_media_messages;
create policy staff_media_send_self on public.staff_media_messages for insert to authenticated
with check (sender_user_id=(select auth.uid()) and recipient_user_id<>(select auth.uid())
and recipient_user_id in (select d.id from public.list_staff_directory() d));
drop policy if exists staff_media_mark_read on public.staff_media_messages;
create policy staff_media_mark_read on public.staff_media_messages for update to authenticated
using (recipient_user_id=(select auth.uid()))
with check (recipient_user_id=(select auth.uid()) and sender_user_id<>(select auth.uid()) and read_at is not null);
grant select, insert, update on public.staff_media_messages to authenticated;

drop policy if exists staff_media_objects_read_participant on storage.objects;
create policy staff_media_objects_read_participant on storage.objects for select to authenticated
using (bucket_id='staff-media' and ((storage.foldername(name))[1]=(select auth.uid())::text or (storage.foldername(name))[2]=(select auth.uid())::text));
drop policy if exists staff_media_objects_upload_sender on storage.objects;
create policy staff_media_objects_upload_sender on storage.objects for insert to authenticated
with check (bucket_id='staff-media' and (storage.foldername(name))[1]=(select auth.uid())::text
and (storage.foldername(name))[2] in (select d.id::text from public.list_staff_directory() d));
