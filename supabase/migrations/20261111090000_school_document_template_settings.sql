-- school_document_template_settings_20261111
-- Persistent school-wide report-card and receipt layout preferences.
create table if not exists public.school_document_template_settings (
  document_type text not null check (document_type in ('report_card','receipt')),
  school_section text not null check (school_section in ('nursery','lower_primary','upper_primary','all')),
  template_key text not null default 'classic-current',
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint school_document_template_settings_document_section_check
    check (
      (document_type='report_card' and school_section in ('nursery','lower_primary','upper_primary'))
      or (document_type='receipt' and school_section='all')
    ),
  constraint school_document_template_settings_pkey primary key (document_type,school_section)
);

alter table public.school_document_template_settings enable row level security;
revoke all on table public.school_document_template_settings from public, anon;
grant select, insert, update on table public.school_document_template_settings to authenticated;

drop policy if exists "Authenticated users can read school document template settings" on public.school_document_template_settings;
create policy "Authenticated users can read school document template settings"
  on public.school_document_template_settings for select to authenticated using (true);

drop policy if exists "School administrators can create document template settings" on public.school_document_template_settings;
create policy "School administrators can create document template settings"
  on public.school_document_template_settings for insert to authenticated
  with check (public.is_school_admin());

drop policy if exists "School administrators can update document template settings" on public.school_document_template_settings;
create policy "School administrators can update document template settings"
  on public.school_document_template_settings for update to authenticated
  using (public.is_school_admin()) with check (public.is_school_admin());

insert into public.school_document_template_settings
  (document_type,school_section,template_key,settings)
values
  ('report_card','nursery','classic-current','{"layout":"classic","accent":"#14532d","tint":"#f0fdf4","font":"Arial","motif":"none","show":{"identity":true,"marks":true,"summary":true,"grading":true,"comments":true,"footer":true,"signatures":true,"parentPortal":true},"customFields":[]}'),
  ('report_card','lower_primary','classic-current','{"layout":"classic","accent":"#14532d","tint":"#f0fdf4","font":"Arial","motif":"none","show":{"identity":true,"marks":true,"summary":true,"grading":true,"comments":true,"footer":true,"signatures":true,"parentPortal":true},"customFields":[]}'),
  ('report_card','upper_primary','classic-current','{"layout":"classic","accent":"#14532d","tint":"#f0fdf4","font":"Arial","motif":"none","show":{"identity":true,"marks":true,"summary":true,"grading":true,"comments":true,"footer":true,"signatures":true,"parentPortal":true},"customFields":[]}'),
  ('receipt','all','classic-current','{"layout":"classic","accent":"#14532d","tint":"#f0fdf4","font":"Arial","motif":"none","paperWidth":"80","show":{"signatures":true},"customFields":[]}')
on conflict (document_type,school_section) do nothing;
comment on table public.school_document_template_settings is
  'School-wide report-card and receipt template selections and safe presentation settings. Only active school administrators may change settings; authenticated users may read them.';
