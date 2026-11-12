-- Capacity monitoring and early-warning alerts for CORNHILL.
-- Configured against the project's current Supabase Free allowance as of 2026-11-12.
-- Update this private configuration with a reviewed migration if the provider plan changes.

CREATE TABLE IF NOT EXISTS private.school_capacity_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  supabase_plan text NOT NULL CHECK (supabase_plan IN ('free','pro','team','enterprise')),
  database_limit_bytes bigint NOT NULL CHECK (database_limit_bytes > 0),
  storage_limit_bytes bigint NOT NULL CHECK (storage_limit_bytes > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.school_capacity_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.school_capacity_config FROM PUBLIC, anon, authenticated;

INSERT INTO private.school_capacity_config (
  id, supabase_plan, database_limit_bytes, storage_limit_bytes
)
VALUES (1, 'free', 524288000, 1073741824)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.read_school_capacity_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_plan text;
  v_database_limit bigint;
  v_storage_limit bigint;
  v_database_bytes bigint;
  v_storage_bytes bigint;
  v_storage_objects bigint;
  v_bucket_count bigint;
BEGIN
  SELECT c.supabase_plan, c.database_limit_bytes, c.storage_limit_bytes
  INTO v_plan, v_database_limit, v_storage_limit
  FROM private.school_capacity_config c
  WHERE c.id = 1;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'School capacity configuration is missing';
  END IF;

  v_database_bytes := pg_catalog.pg_database_size(pg_catalog.current_database());

  SELECT
    count(*)::bigint,
    coalesce(sum(
      CASE
        WHEN coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
          THEN (o.metadata->>'size')::bigint
        ELSE 0
      END
    ), 0)::bigint
  INTO v_storage_objects, v_storage_bytes
  FROM storage.objects o;

  SELECT count(*)::bigint
  INTO v_bucket_count
  FROM storage.buckets;

  RETURN pg_catalog.jsonb_build_object(
    'measured_at', now(),
    'plan', v_plan,
    'database', pg_catalog.jsonb_build_object(
      'used_bytes', v_database_bytes,
      'limit_bytes', v_database_limit,
      'percent_used', round((v_database_bytes::numeric * 100) / nullif(v_database_limit, 0), 1)
    ),
    'storage', pg_catalog.jsonb_build_object(
      'used_bytes', v_storage_bytes,
      'limit_bytes', v_storage_limit,
      'percent_used', round((v_storage_bytes::numeric * 100) / nullif(v_storage_limit, 0), 1),
      'object_count', v_storage_objects,
      'bucket_count', v_bucket_count
    ),
    'warning_thresholds', pg_catalog.jsonb_build_object(
      'warning', 70,
      'urgent', 85,
      'critical', 95
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.read_school_capacity_metrics() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_school_system_capacity_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_school_admin(), false) THEN
    RAISE EXCEPTION 'Only an authenticated school administrator can view capacity metrics'
      USING errcode = '42501';
  END IF;

  RETURN private.read_school_capacity_metrics();
END;
$function$;

REVOKE ALL ON FUNCTION public.get_school_system_capacity_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_school_system_capacity_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION private.check_school_capacity_thresholds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_metrics jsonb;
  v_database_pct numeric;
  v_storage_pct numeric;
  v_database_used bigint;
  v_storage_used bigint;
  v_database_limit bigint;
  v_storage_limit bigint;
  v_plan text;
  v_item record;
  v_level text;
  v_severity text;
  v_title text;
  v_message text;
  v_source_key text;
BEGIN
  v_metrics := private.read_school_capacity_metrics();
  v_plan := v_metrics->>'plan';

  v_database_pct := (v_metrics #>> '{database,percent_used}')::numeric;
  v_storage_pct := (v_metrics #>> '{storage,percent_used}')::numeric;
  v_database_used := (v_metrics #>> '{database,used_bytes}')::bigint;
  v_storage_used := (v_metrics #>> '{storage,used_bytes}')::bigint;
  v_database_limit := (v_metrics #>> '{database,limit_bytes}')::bigint;
  v_storage_limit := (v_metrics #>> '{storage,limit_bytes}')::bigint;

  FOR v_item IN
    SELECT *
    FROM (VALUES
      ('database', v_database_pct, v_database_used, v_database_limit),
      ('storage', v_storage_pct, v_storage_used, v_storage_limit)
    ) AS metrics(resource_key, percent_used, used_bytes, limit_bytes)
  LOOP
    v_source_key := 'system-capacity:' || v_item.resource_key;

    IF v_item.percent_used < 70 THEN
      UPDATE public.school_notifications
      SET resolved_at = coalesce(resolved_at, now())
      WHERE source_key = v_source_key
        AND category = 'system_health'
        AND resolved_at IS NULL;
      CONTINUE;
    END IF;

    v_level := CASE
      WHEN v_item.percent_used >= 95 THEN 'critical'
      WHEN v_item.percent_used >= 85 THEN 'urgent'
      ELSE 'warning'
    END;

    v_severity := CASE WHEN v_item.percent_used >= 85 THEN 'urgent' ELSE 'warning' END;
    v_title := 'CORNHILL ' || v_item.resource_key || ' capacity ' || upper(v_level);
    v_message := CASE
      WHEN v_item.resource_key = 'database' THEN 'Database'
      ELSE 'Private file storage'
    END
      || ' is ' || v_item.percent_used::text || '% full ('
      || pg_catalog.pg_size_pretty(v_item.used_bytes) || ' of '
      || pg_catalog.pg_size_pretty(v_item.limit_bytes)
      || ' configured on the Supabase ' || v_plan
      || ' baseline). Review capacity before the configured limit is reached.';

    INSERT INTO public.school_notifications (
      category, severity, title, message, action_workspace, source_key,
      audience_role, action_payload, is_actionable
    ) VALUES (
      'system_health', v_severity, v_title, v_message, 'system_health',
      v_source_key, 'Admin',
      pg_catalog.jsonb_build_object(
        'url', 'https://system-health-cornhill-school.vercel.app/apps/system-health/',
        'workspace', 'system_health',
        'target_id', 'system-health'
      ), true
    )
    ON CONFLICT (source_key) DO UPDATE
    SET severity = excluded.severity,
        title = excluded.title,
        message = excluded.message,
        created_at = now(),
        resolved_at = NULL,
        archived_at = NULL,
        archive_reason = NULL;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION private.check_school_capacity_thresholds() FROM PUBLIC, anon, authenticated;

-- Keep the existing connection-check resolver from closing the new capacity alerts.
CREATE OR REPLACE FUNCTION public.record_school_system_health_notification(p_checks jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_auth text;
  v_database text;
  v_apps text;
  v_backup text;
  v_severity text;
  v_failed text[] := ARRAY[]::text[];
  v_bucket bigint;
  v_source text;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_school_admin(), false) THEN
    RAISE EXCEPTION 'Only an authenticated school administrator can record a system-health check'
      USING errcode = '42501';
  END IF;

  IF jsonb_typeof(p_checks) <> 'object' THEN
    RAISE EXCEPTION 'Health-check results must be a JSON object';
  END IF;

  v_auth := p_checks->>'auth';
  v_database := p_checks->>'database';
  v_apps := p_checks->>'apps';
  v_backup := p_checks->>'backup';

  IF v_auth NOT IN ('connected','failed')
     OR v_database NOT IN ('reachable','failed')
     OR v_apps NOT IN ('reachable','failed')
     OR v_backup NOT IN ('available','unavailable') THEN
    RAISE EXCEPTION 'One or more system-health result values are invalid';
  END IF;

  IF v_auth = 'failed' THEN v_failed := array_append(v_failed, 'Authentication'); END IF;
  IF v_database = 'failed' THEN v_failed := array_append(v_failed, 'Database'); END IF;
  IF v_apps = 'failed' THEN v_failed := array_append(v_failed, 'Application registry'); END IF;
  IF v_backup = 'unavailable' THEN v_failed := array_append(v_failed, 'Backup status'); END IF;

  IF cardinality(v_failed) = 0 THEN
    UPDATE public.school_notifications
    SET resolved_at = coalesce(resolved_at, now())
    WHERE category = 'system_health'
      AND source_key LIKE 'system-health:%'
      AND resolved_at IS NULL;
    RETURN;
  END IF;

  v_severity := CASE
    WHEN v_auth = 'failed' OR v_database = 'failed' THEN 'urgent'
    ELSE 'warning'
  END;
  v_bucket := floor(extract(epoch FROM now()) / 900)::bigint;
  v_source := 'system-health:' || v_bucket::text;

  INSERT INTO public.school_notifications (
    category, severity, title, message, action_workspace, source_key,
    audience_role, action_payload, is_actionable
  ) VALUES (
    'system_health', v_severity, 'CORNHILL system check needs attention',
    'The following checks need review: ' || array_to_string(v_failed, ', ')
      || '. Open System Health & Recovery for the current check results.',
    'system_health', v_source, 'Admin',
    pg_catalog.jsonb_build_object(
      'url', 'https://system-health-cornhill-school.vercel.app/apps/system-health/',
      'workspace', 'system_health',
      'target_id', 'system-health'
    ), true
  )
  ON CONFLICT (source_key) DO UPDATE
  SET severity = excluded.severity,
      message = excluded.message,
      created_at = now(),
      resolved_at = NULL,
      archived_at = NULL,
      archive_reason = NULL;
END;
$function$;

-- Execute the existing check once to establish a baseline, then repeat every 15 minutes.
DO $migration$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'cornhill-system-capacity-monitor';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  -- Run once during migration so the new function is exercised immediately.
  PERFORM private.check_school_capacity_thresholds();

  PERFORM cron.schedule(
    'cornhill-system-capacity-monitor',
    '*/15 * * * *',
    'select private.check_school_capacity_thresholds();'
  );
END;
$migration$;
