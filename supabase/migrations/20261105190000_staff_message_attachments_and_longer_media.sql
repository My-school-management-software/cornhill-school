-- Allow private staff chats to carry images, audio files and video clips.
-- Keep the bucket private and retain the existing participant-only storage policies.
alter table public.staff_media_messages
  drop constraint if exists staff_media_messages_media_type_check;
alter table public.staff_media_messages
  add constraint staff_media_messages_media_type_check
  check (media_type in ('audio','video','image'));

alter table public.staff_media_messages
  drop constraint if exists staff_media_messages_duration_seconds_check;
alter table public.staff_media_messages
  add constraint staff_media_messages_duration_seconds_check
  check (duration_seconds between 0 and 600);

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp',
      'audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-wav',
      'video/webm','video/mp4','video/quicktime','video/ogg'
    ]
where id = 'staff-media';
