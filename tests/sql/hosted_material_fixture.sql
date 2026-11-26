-- Disposable PostgreSQL only. Never run against school database.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table public.user_profiles(id uuid primary key,role text not null,active boolean not null);
create table public.school_classes(id uuid primary key,name text not null);
create table public.academic_terms(id uuid primary key,starts_on date not null,ends_on date not null,is_closed boolean not null,is_current boolean not null);
create table public.students(id uuid primary key,class_id uuid not null references public.school_classes(id),status text not null);
create function public.is_school_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_profiles where id=auth.uid() and role='Admin' and active) $$;
grant select on public.academic_terms to authenticated;
insert into public.user_profiles values ('00000000-0000-4000-8000-000000000001','Admin',true),('00000000-0000-4000-8000-000000000002','Teacher',true),('00000000-0000-4000-8000-000000000003','Admin',false);
insert into public.school_classes values ('10000000-0000-4000-8000-000000000001','Baby'),('10000000-0000-4000-8000-000000000002','Middle');
insert into public.academic_terms values ('20000000-0000-4000-8000-000000000001','2026-09-01','2026-12-01',false,true),('20000000-0000-4000-8000-000000000002','2026-01-01','2026-04-01',true,false);
insert into public.students values ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Active'),('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Active'),('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Active');
