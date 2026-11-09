-- Private learner photographs with administrator-only uploads and assigned-teacher viewing.
alter table public.students add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learner-photos', 'learner-photos', false, 4194304, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 4194304,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Admins and assigned teachers view learner photos" on storage.objects;
create policy "Admins and assigned teachers view learner photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'learner-photos'
  and (
    public.is_school_admin()
    or exists (
      select 1
      from public.students s
      join public.class_subjects cs on cs.class_id = s.class_id
      where s.id::text = (storage.foldername(name))[1]
        and cs.teacher_user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Admins upload learner photos" on storage.objects;
create policy "Admins upload learner photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'learner-photos'
  and public.is_school_admin()
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

drop policy if exists "Admins update learner photos" on storage.objects;
create policy "Admins update learner photos"
on storage.objects for update to authenticated
using (bucket_id = 'learner-photos' and public.is_school_admin())
with check (bucket_id = 'learner-photos' and public.is_school_admin());

drop policy if exists "Admins delete learner photos" on storage.objects;
create policy "Admins delete learner photos"
on storage.objects for delete to authenticated
using (bucket_id = 'learner-photos' and public.is_school_admin());

comment on column public.students.photo_path is 'Private Supabase Storage object path for the learner photograph; never store a public URL.';
