create schema if not exists private;

create table if not exists private.google_drive_backup_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'google_drive' check (provider = 'google_drive'),
  connected_email text not null,
  drive_folder_id text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  token_expires_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.google_drive_backup_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists private.google_drive_backup_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'google_drive',
  status text not null check (status in ('started','success','failed','validation_only')),
  drive_file_id text,
  file_name text,
  record_counts jsonb not null default '{}'::jsonb,
  total_records bigint not null default 0,
  error_message text,
  started_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists private.google_drive_backup_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  frequency text not null default 'daily' check (frequency in ('daily','weekly','monthly','termly','yearly')),
  last_scheduled_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into private.google_drive_backup_settings (id) values (true)
on conflict (id) do nothing;

alter table private.google_drive_backup_connections enable row level security;
alter table private.google_drive_backup_oauth_states enable row level security;
alter table private.google_drive_backup_runs enable row level security;
alter table private.google_drive_backup_settings enable row level security;

revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on all tables in schema private to service_role;
grant all on all sequences in schema private to service_role;

comment on schema private is 'Non-API school integration secrets and backup control data. Access only through trusted server functions.';
comment on table private.google_drive_backup_connections is 'Google OAuth tokens encrypted by the server-side backup encryption key; never expose through the Data API.';
comment on table private.google_drive_backup_runs is 'Audit history for school backups sent to the connected Google Drive.';
