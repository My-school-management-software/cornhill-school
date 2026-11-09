-- Support the Teacher role used by assigned-teacher academic workflows.
alter table public.user_profiles drop constraint if exists user_profiles_role_check;
alter table public.user_profiles add constraint user_profiles_role_check check (role = any (array['Admin'::text,'Teacher'::text,'Staff'::text]));
