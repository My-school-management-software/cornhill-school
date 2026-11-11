-- Close remaining direct employment-status checks in authenticated
-- SECURITY DEFINER RPCs. These functions intentionally retain their existing
-- authorization and data-shaping logic; only NULL-as-active fallbacks are
-- removed and teacher directory rows are required to be explicitly Active.
--
-- The DO block fails closed if the expected production definitions drift:
-- it must find and replace the audited guards before changing any function.

do $migration$
declare
  v_name text;
  v_signature regprocedure;
  v_definition text;
  v_updated text;
  v_count integer;
  v_names text[] := array[
    'archive_school_notification(uuid,text)',
    'list_school_notification_center(boolean,boolean)',
    'list_school_notifications()',
    'mark_school_notification_read(uuid)',
    'restore_school_notification(uuid)',
    'teacher_guardian_pin_status()',
    'teacher_list_my_assignments()',
    'teacher_subject_learner_roster(uuid)',
    'teacher_visiting_day_lookup(text)',
    'touch_evidence_capture_device(uuid)'
  ];
begin
  foreach v_name in array v_names loop
    v_signature := to_regprocedure('public.' || v_name);
    if v_signature is null then
      raise exception 'Expected audited RPC is missing: %', v_name;
    end if;

    v_definition := pg_get_functiondef(v_signature);
    v_updated := v_definition;

    -- NULL or blank employment status must never mean Active.
    v_updated := regexp_replace(
      v_updated,
      'coalesce\((up|p|u)\.employment_status,\s*''Active''\)\s*=\s*''Active''',
      '\1.employment_status = ''Active''',
      'gi'
    );

    -- Teacher directory rows also require an explicit Active status.
    v_updated := regexp_replace(
      v_updated,
      'coalesce\(td\.employment_status,\s*''Active''\)\s*=\s*''Active''',
      'td.employment_status = ''Active''',
      'gi'
    );

    if v_name = 'teacher_guardian_pin_status()' then
      v_updated := replace(v_updated,
        'lower(up.role)=''teacher''',
        'lower(up.role)=''teacher'' and up.employment_status=''Active''');
    end if;

    if v_name = 'teacher_subject_learner_roster(uuid)' then
      v_updated := replace(v_updated,
        'and (cs.can_enter_marks or cs.can_view_reports)',
        'and (cs.can_enter_marks or cs.can_view_reports)' || E'\n      and (td.id is null or td.employment_status = ''Active'')');
    end if;

    if v_name = 'teacher_list_my_assignments()' then
      v_updated := replace(v_updated,
        'and (cs.can_enter_marks or cs.can_view_reports or cs.can_message_parents)',
        'and (cs.can_enter_marks or cs.can_view_reports or cs.can_message_parents)' || E'\n    and (td.id is null or td.employment_status = ''Active'')');
    end if;

    if v_updated = v_definition then
      raise exception 'No expected employment guard changed in %; refusing partial migration', v_name;
    end if;

    execute v_updated;
  end loop;
end;
$migration$;
