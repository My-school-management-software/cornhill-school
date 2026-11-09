-- CORNHILL visitor gate and school property / maintenance workspaces.
-- Additive tables only; the existing school inventory and staff attendance records are untouched.

create table if not exists public.school_visitor_log (
 id uuid primary key default gen_random_uuid(),
 visitor_name text not null check(length(btrim(visitor_name)) between 2 and 140),
 visitor_phone text not null default '' check(length(visitor_phone)<=25),
 organisation text not null default '' check(length(organisation)<=120),
 visit_purpose text not null check(length(btrim(visit_purpose)) between 3 and 500),
 person_to_visit text not null check(length(btrim(person_to_visit)) between 2 and 140),
 destination text not null default '' check(length(destination)<=120),
 vehicle_number text not null default '' check(length(vehicle_number)<=30),
 pass_code text not null unique check(length(btrim(pass_code)) between 4 and 40),
 status text not null default 'Checked In' check(status in ('Checked In','Checked Out','Cancelled')),
 checked_in_at timestamptz not null default now(),
 checked_out_at timestamptz null,
 checked_in_by uuid not null references auth.users(id) on delete restrict,
 checked_out_by uuid null references auth.users(id) on delete set null,
 notes text not null default '' check(length(notes)<=600),
 created_at timestamptz not null default now(),
 constraint school_visitor_checkout_state_check check (
  (status='Checked Out' and checked_out_at is not null and checked_out_by is not null)
  or (status<>'Checked Out' and checked_out_at is null and checked_out_by is null)
 )
);
create index if not exists school_visitor_log_status_in_idx on public.school_visitor_log(status,checked_in_at desc);
create index if not exists school_visitor_log_checked_in_by_idx on public.school_visitor_log(checked_in_by);
create index if not exists school_visitor_log_checked_out_by_idx on public.school_visitor_log(checked_out_by);
alter table public.school_visitor_log enable row level security;
revoke all on public.school_visitor_log from public,anon;
grant select,insert,update on public.school_visitor_log to authenticated;
drop policy if exists "Authorised gate staff read visitor log" on public.school_visitor_log;
create policy "Authorised gate staff read visitor log"
on public.school_visitor_log for select to authenticated
using (
 (select public.is_school_admin()) or exists (
  select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and p.employment_status='Active'
   and lower(btrim(coalesce(p.job_title,''))) in
   ('receptionist','security officer','security guard','gatekeeper','front office','office administrator')
 )
);
drop policy if exists "Authorised gate staff check visitors in" on public.school_visitor_log;
create policy "Authorised gate staff check visitors in"
on public.school_visitor_log for insert to authenticated
with check (
 checked_in_by=(select auth.uid()) and status='Checked In'
 and checked_out_at is null and checked_out_by is null
 and exists (
  select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and p.employment_status='Active'
   and lower(btrim(coalesce(p.job_title,''))) in
   ('receptionist','security officer','security guard','gatekeeper','front office','office administrator')
 )
);
drop policy if exists "Authorised gate staff check visitors out" on public.school_visitor_log;
create policy "Authorised gate staff check visitors out"
on public.school_visitor_log for update to authenticated
using (
 (select public.is_school_admin()) or exists (
  select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and p.employment_status='Active'
   and lower(btrim(coalesce(p.job_title,''))) in
   ('receptionist','security officer','security guard','gatekeeper','front office','office administrator')
 )
)
with check (
 (select public.is_school_admin()) or exists (
  select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and p.employment_status='Active'
   and lower(btrim(coalesce(p.job_title,''))) in
   ('receptionist','security officer','security guard','gatekeeper','front office','office administrator')
 )
);
drop policy if exists "Administrators delete visitor log entries" on public.school_visitor_log;
create policy "Administrators delete visitor log entries"
on public.school_visitor_log for delete to authenticated
using ((select public.is_school_admin()));

create table if not exists public.school_assets (
 id uuid primary key default gen_random_uuid(),
 asset_code text not null unique check(length(btrim(asset_code)) between 2 and 60),
 asset_name text not null check(length(btrim(asset_name)) between 2 and 160),
 category text not null check(length(btrim(category)) between 2 and 80),
 serial_number text not null default '' check(length(serial_number)<=100),
 location text not null default '' check(length(location)<=120),
 assigned_to uuid null references auth.users(id) on delete set null,
 purchase_date date null,
 purchase_cost_ugx bigint not null default 0 check(purchase_cost_ugx>=0),
 condition text not null default 'Good' check(condition in ('New','Good','Fair','Poor','Damaged')),
 status text not null default 'In Use' check(status in ('In Use','Stored','Under Repair','Disposed','Lost')),
 notes text not null default '' check(length(notes)<=1000),
 created_by uuid not null references auth.users(id) on delete restrict,
 updated_by uuid null references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists school_assets_category_status_idx on public.school_assets(category,status);
create index if not exists school_assets_assigned_to_idx on public.school_assets(assigned_to);
create index if not exists school_assets_created_by_idx on public.school_assets(created_by);
create index if not exists school_assets_updated_by_idx on public.school_assets(updated_by);
alter table public.school_assets enable row level security;
revoke all on public.school_assets from public,anon;
grant select,insert,update,delete on public.school_assets to authenticated;
drop policy if exists "Administrators and asset managers read assets" on public.school_assets;
create policy "Administrators and asset managers read assets"
on public.school_assets for select to authenticated
using (
 (select public.is_school_admin()) or exists (
  select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and p.employment_status='Active'
   and lower(btrim(coalesce(p.job_title,''))) in
   ('store manager','store officer','stores manager','property officer','maintenance officer','ict support','ict officer')
 )
);
drop policy if exists "Administrators and store managers insert assets" on public.school_assets;
create policy "Administrators and store managers insert assets"
on public.school_assets for insert to authenticated
with check (
 created_by=(select auth.uid()) and (
  (select public.is_school_admin()) or exists (
   select 1 from public.user_profiles p
   where p.id=(select auth.uid()) and p.employment_status='Active'
    and lower(btrim(coalesce(p.job_title,''))) in ('store manager','store officer','stores manager')
  )
 )
);
drop policy if exists "Administrators and store managers update assets" on public.school_assets;
create policy "Administrators and store managers update assets"
on public.school_assets for update to authenticated
using (
 (select public.is_school_admin()) or exists (
  select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and p.employment_status='Active'
   and lower(btrim(coalesce(p.job_title,''))) in ('store manager','store officer','stores manager')
 )
)
with check (
 (select public.is_school_admin()) or exists (
  select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and p.employment_status='Active'
   and lower(btrim(coalesce(p.job_title,''))) in ('store manager','store officer','stores manager')
 )
);
drop policy if exists "Administrators delete assets" on public.school_assets;
create policy "Administrators delete assets"
on public.school_assets for delete to authenticated
using ((select public.is_school_admin()));

create table if not exists public.school_asset_maintenance (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid null references public.school_assets(id) on delete set null,
 asset_label text not null default '' check(length(asset_label)<=160),
 issue_title text not null check(length(btrim(issue_title)) between 3 and 140),
 description text not null check(length(btrim(description)) between 5 and 1600),
 urgency text not null default 'Normal' check(urgency in ('Low','Normal','High','Urgent')),
 status text not null default 'Reported' check(status in ('Reported','Assigned','In Progress','Awaiting Parts','Completed','Cancelled')),
 assigned_to uuid null references auth.users(id) on delete set null,
 estimated_cost_ugx bigint not null default 0 check(estimated_cost_ugx>=0),
 actual_cost_ugx bigint not null default 0 check(actual_cost_ugx>=0),
 resolution_note text not null default '' check(length(resolution_note)<=1200),
 reported_by uuid not null references auth.users(id) on delete restrict,
 resolved_at timestamptz null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists school_asset_maintenance_status_date_idx on public.school_asset_maintenance(status,created_at desc);
create index if not exists school_asset_maintenance_asset_idx on public.school_asset_maintenance(asset_id);
create index if not exists school_asset_maintenance_reported_by_idx on public.school_asset_maintenance(reported_by);
create index if not exists school_asset_maintenance_assigned_to_idx on public.school_asset_maintenance(assigned_to);
alter table public.school_asset_maintenance enable row level security;
revoke all on public.school_asset_maintenance from public,anon;
grant select,insert,update on public.school_asset_maintenance to authenticated;
drop policy if exists "Staff read own maintenance reports and managers read all" on public.school_asset_maintenance;
create policy "Staff read own maintenance reports and managers read all"
on public.school_asset_maintenance for select to authenticated
using (
 reported_by=(select auth.uid())
 or (select public.is_school_admin())
 or exists (
  select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and p.employment_status='Active'
   and lower(btrim(coalesce(p.job_title,''))) in
   ('store manager','store officer','stores manager','property officer','maintenance officer','ict support','ict officer')
 )
);
drop policy if exists "Active school staff submit maintenance reports" on public.school_asset_maintenance;
create policy "Active school staff submit maintenance reports"
on public.school_asset_maintenance for insert to authenticated
with check (
 reported_by=(select auth.uid()) and status='Reported'
 and assigned_to is null and actual_cost_ugx=0 and resolved_at is null
 and exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active')
);
drop policy if exists "Administrators and asset managers update maintenance" on public.school_asset_maintenance;
create policy "Administrators and asset managers update maintenance"
on public.school_asset_maintenance for update to authenticated
using (
 (select public.is_school_admin()) or exists (
  select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and p.employment_status='Active'
   and lower(btrim(coalesce(p.job_title,''))) in
   ('store manager','store officer','stores manager','property officer','maintenance officer','ict support','ict officer')
 )
)
with check (
 (select public.is_school_admin()) or exists (
  select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and p.employment_status='Active'
   and lower(btrim(coalesce(p.job_title,''))) in
   ('store manager','store officer','stores manager','property officer','maintenance officer','ict support','ict officer')
 )
);

insert into public.school_apps
 (app_key,name,description,category,icon,app_url,app_kind,allowed_roles,allowed_job_titles,sort_order,is_active)
values
 ('visitor-gate-register','Visitor & Gate Register','Restricted visitor check-in, pass tracking and check-out register for approved reception and security staff.','School','🪪','/school-services.html#visitor-register','Internal',array['Admin','Staff']::text[],array['receptionist','security officer','security guard','gatekeeper','front office','office administrator']::text[],160,true),
 ('school-assets-maintenance','School Assets & Maintenance','School asset register and maintenance issue tracking for administrators and approved store / maintenance staff. Staff can submit their own issue reports.','School','🧰','/school-services.html#facilities','Internal',array['Admin','Staff','Teacher']::text[],'{}'::text[],170,true)
on conflict(app_key) do update set
 name=excluded.name,description=excluded.description,category=excluded.category,icon=excluded.icon,
 app_url=excluded.app_url,app_kind=excluded.app_kind,allowed_roles=excluded.allowed_roles,
 allowed_job_titles=excluded.allowed_job_titles,sort_order=excluded.sort_order,is_active=true,
 updated_at=now();
