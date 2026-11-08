-- The daily backup endpoint takes longer than pg_net's 5-second default
-- when exporting the school's full encrypted data set. Raise only this
-- scheduled request timeout; do not change project or subscription settings.
select cron.alter_job(
  job_id := 2,
  command := $backup$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'cornhill_backup_project_url')
        || '/functions/v1/google-drive-backup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cornhill-scheduler-token',
        (select decrypted_secret from vault.decrypted_secrets where name = 'cornhill_backup_scheduler_token')
      ),
      body := '{"action":"scheduled_backup"}'::jsonb,
      timeout_milliseconds := 60000
    );
  $backup$
);