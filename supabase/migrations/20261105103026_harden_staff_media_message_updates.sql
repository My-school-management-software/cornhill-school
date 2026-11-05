-- Recipients may only update read_at; they cannot rewrite media ownership or file metadata.
revoke all privileges on table public.staff_media_messages from anon, authenticated;
revoke all privileges (id, sender_user_id, recipient_user_id, media_type, storage_path, mime_type, duration_seconds, created_at, read_at)
on table public.staff_media_messages from anon, authenticated;
grant select on table public.staff_media_messages to authenticated;
grant insert (sender_user_id, recipient_user_id, media_type, storage_path, mime_type, duration_seconds)
on table public.staff_media_messages to authenticated;
grant update (read_at) on table public.staff_media_messages to authenticated;
