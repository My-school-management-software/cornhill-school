-- Public, minimal class/teacher-name directory for the sign-in landing page.
-- Only display names are public; authentication and class permissions remain in Supabase Auth/RLS.
create table if not exists public.class_login_directory (
  class_key text primary key check (class_key in ('Baby','Middle','Top','P1','P2','P3','P4','P5','P6','P7')),
  class_label text not null,
  teacher_name text,
  display_order integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.class_login_directory enable row level security;
revoke all on public.class_login_directory from anon, authenticated;
grant select on public.class_login_directory to anon, authenticated;
grant insert, update, delete on public.class_login_directory to authenticated;
drop policy if exists "Public can view class login directory" on public.class_login_directory;
create policy "Public can view class login directory" on public.class_login_directory for select to anon, authenticated using (true);
drop policy if exists "Admins manage class login directory" on public.class_login_directory;
create policy "Admins manage class login directory" on public.class_login_directory for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
insert into public.class_login_directory(class_key,class_label,display_order) values
('Baby','Baby Class',1),('Middle','Middle Class',2),('Top','Top Class',3),
('P1','Primary One (P1)',4),('P2','Primary Two (P2)',5),('P3','Primary Three (P3)',6),
('P4','Primary Four (P4)',7),('P5','Primary Five (P5)',8),('P6','Primary Six (P6)',9),('P7','Primary Seven (P7)',10)
on conflict (class_key) do update set class_label=excluded.class_label, display_order=excluded.display_order;