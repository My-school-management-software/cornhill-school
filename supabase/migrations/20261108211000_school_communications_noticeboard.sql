-- Internal staff communications: announcements and school calendar events.
create table if not exists public.school_staff_notices (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(trim(title)) between 3 and 140),
 body text not null check (char_length(trim(body)) between 3 and 8000),
 category text not null default 'General' check (category in ('General','Academic','Operations','Urgent')),
 priority text not null default 'Normal' check (priority in ('Normal','Important','Urgent')),
 audience_roles text[] not null default array['Admin','Teacher','Staff']::text[]
   check (cardinality(audience_roles)>0 and audience_roles <@ array['Admin','Teacher','Staff']::text[]),
 publish_at timestamptz not null default now(),
 expires_at timestamptz,
 is_published boolean not null default true,
 created_by uuid not null references public.user_profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (expires_at is null or expires_at>publish_at)
);
create index if not exists school_staff_notices_publish_idx
 on public.school_staff_notices(is_published,publish_at desc,expires_at);
create index if not exists school_staff_notices_created_idx
 on public.school_staff_notices(created_at desc);

create table if not exists public.school_calendar_events (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(trim(title)) between 3 and 140),
 description text check (description is null or char_length(description)<=4000),
 event_date date not null,
 start_time time,
 end_time time,
 venue text check (venue is null or char_length(venue)<=160),
 audience_roles text[] not null default array['Admin','Teacher','Staff']::text[]
   check (cardinality(audience_roles)>0 and audience_roles <@ array['Admin','Teacher','Staff']::text[]),
 is_published boolean not null default true,
 created_by uuid not null references public.user_profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (start_time is null or end_time is null or end_time>start_time)
);
create index if not exists school_calendar_events_date_idx
 on public.school_calendar_events(is_published,event_date,start_time);

alter table public.school_staff_notices enable row level security;
alter table public.school_calendar_events enable row level security;

drop policy if exists "School staff read targeted notices" on public.school_staff_notices;
create policy "School staff read targeted notices"
on public.school_staff_notices for select to authenticated
using (
 (select public.is_school_admin())
 or (
  is_published
  and publish_at <= now()
  and (expires_at is null or expires_at >= now())
  and exists (
   select 1 from public.user_profiles p
   where p.id=(select auth.uid()) and p.role=any(school_staff_notices.audience_roles)
  )
 )
);
drop policy if exists "Admins insert staff notices" on public.school_staff_notices;
create policy "Admins insert staff notices" on public.school_staff_notices for insert to authenticated
with check ((select public.is_school_admin()) and created_by=(select auth.uid()));
drop policy if exists "Admins update staff notices" on public.school_staff_notices;
create policy "Admins update staff notices" on public.school_staff_notices for update to authenticated
using ((select public.is_school_admin())) with check ((select public.is_school_admin()));
drop policy if exists "Admins delete staff notices" on public.school_staff_notices;
create policy "Admins delete staff notices" on public.school_staff_notices for delete to authenticated
using ((select public.is_school_admin()));

drop policy if exists "School staff read published calendar events" on public.school_calendar_events;
create policy "School staff read published calendar events"
on public.school_calendar_events for select to authenticated
using (
 (select public.is_school_admin())
 or (
  is_published
  and exists (
   select 1 from public.user_profiles p
   where p.id=(select auth.uid()) and p.role=any(school_calendar_events.audience_roles)
  )
 )
);
drop policy if exists "Admins insert calendar events" on public.school_calendar_events;
create policy "Admins insert calendar events" on public.school_calendar_events for insert to authenticated
with check ((select public.is_school_admin()) and created_by=(select auth.uid()));
drop policy if exists "Admins update calendar events" on public.school_calendar_events;
create policy "Admins update calendar events" on public.school_calendar_events for update to authenticated
using ((select public.is_school_admin())) with check ((select public.is_school_admin()));
drop policy if exists "Admins delete calendar events" on public.school_calendar_events;
create policy "Admins delete calendar events" on public.school_calendar_events for delete to authenticated
using ((select public.is_school_admin()));

grant select,insert,update,delete on public.school_staff_notices to authenticated;
grant select,insert,update,delete on public.school_calendar_events to authenticated;

insert into public.school_apps(app_key,name,description,category,icon,app_url,app_kind,allowed_roles,allowed_job_titles,sort_order,is_active,created_by,updated_by)
values (
 'school-communications','Staff Communications & Events',
 'Internal school notices, announcements and event calendar for authorised staff.',
 'School','messages-square','/school-communications.html','Internal',
 array['Admin','Teacher','Staff']::text[],array[]::text[],180,true,
 'f9aa5308-eebd-45a3-b4b1-22dbd29e834a'::uuid,'f9aa5308-eebd-45a3-b4b1-22dbd29e834a'::uuid
)
on conflict (app_key) do update set
 name=excluded.name,description=excluded.description,category=excluded.category,icon=excluded.icon,
 app_url=excluded.app_url,app_kind=excluded.app_kind,allowed_roles=excluded.allowed_roles,
 allowed_job_titles=excluded.allowed_job_titles,sort_order=excluded.sort_order,is_active=true,
 updated_by=excluded.updated_by,updated_at=now();
