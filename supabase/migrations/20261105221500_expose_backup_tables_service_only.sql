alter table private.google_drive_backup_connections set schema public;
alter table private.google_drive_backup_oauth_states set schema public;
alter table private.google_drive_backup_runs set schema public;
alter table private.google_drive_backup_settings set schema public;

alter table public.google_drive_backup_connections enable row level security;
alter table public.google_drive_backup_oauth_states enable row level security;
alter table public.google_drive_backup_runs enable row level security;
alter table public.google_drive_backup_settings enable row level security;

revoke all on public.google_drive_backup_connections, public.google_drive_backup_oauth_states,
  public.google_drive_backup_runs, public.google_drive_backup_settings from public, anon, authenticated;
grant all on public.google_drive_backup_connections, public.google_drive_backup_oauth_states,
  public.google_drive_backup_runs, public.google_drive_backup_settings to service_role;

comment on table public.google_drive_backup_connections is 'Encrypted Google Drive OAuth tokens. No anon/authenticated access; server-side Edge Function only.';
comment on table public.google_drive_backup_oauth_states is 'Short-lived, hashed OAuth state values used to prevent CSRF.';
comment on table public.google_drive_backup_runs is 'Private audit log for encrypted CORNHILL backups.';
comment on table public.google_drive_backup_settings is 'Private school backup schedule configuration.';
