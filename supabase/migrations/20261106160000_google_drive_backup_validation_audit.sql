create table if not exists public.google_drive_backup_validations (
  id uuid primary key default gen_random_uuid(),
  backup_run_id uuid not null references public.google_drive_backup_runs(id) on delete restrict,
  validated_by uuid not null references auth.users(id) on delete restrict,
  validation_status text not null check (validation_status in ('passed','failed')),
  file_name text,
  total_records bigint,
  dataset_count integer,
  error_message text,
  validated_at timestamptz not null default now(),
  constraint google_drive_backup_validations_result_shape check (
    (validation_status='passed' and total_records is not null and dataset_count is not null and error_message is null)
    or (validation_status='failed' and error_message is not null)
  )
);
create index if not exists google_drive_backup_validations_run_time_idx
  on public.google_drive_backup_validations(backup_run_id, validated_at desc);
alter table public.google_drive_backup_validations enable row level security;
drop policy if exists "Admins can read backup validation history" on public.google_drive_backup_validations;
create policy "Admins can read backup validation history"
  on public.google_drive_backup_validations for select to authenticated
  using (public.is_school_admin());
revoke all on public.google_drive_backup_validations from anon, authenticated;
grant select on public.google_drive_backup_validations to authenticated;
