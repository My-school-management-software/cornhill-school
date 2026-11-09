do $migration$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.admin_set_learner_archived(uuid,boolean,text)'::regprocedure);
  v_new := replace(v_def,
    '  insert into public.learner_archive_audit',
    E'  if p_archived then\n    delete from public.parent_portal_sessions where student_id = p_student_id;\n  end if;\n\n  insert into public.learner_archive_audit'
  );
  if v_new = v_def then
    raise exception 'Could not add parent-session revocation to learner archive action';
  end if;
  execute v_new;

  v_def := pg_get_functiondef('public.parent_portal_get_learner(text)'::regprocedure);
  v_new := replace(v_def,
    'where upper(s.admission_number) = upper(trim(p_pupil_code))',
    'where upper(s.admission_number) = upper(trim(p_pupil_code)) and s.status <> ''Archived'''
  );
  if v_new = v_def then raise exception 'Could not protect parent learner lookup'; end if;
  execute v_new;

  v_def := pg_get_functiondef('public.parent_portal_get_learner_with_pin(text,text,text)'::regprocedure);
  v_new := replace(v_def,
    'where upper(s.admission_number)=upper(trim(p_pupil_code))',
    'where upper(s.admission_number)=upper(trim(p_pupil_code)) and s.status <> ''Archived'''
  );
  if v_new = v_def then raise exception 'Could not protect parent PIN learner lookup'; end if;
  execute v_new;

  v_def := pg_get_functiondef('public.parent_change_guardian_pin(text,text,text,text)'::regprocedure);
  v_new := replace(v_def,
    'where upper(s.admission_number)=upper(trim(p_pupil_code))',
    'where upper(s.admission_number)=upper(trim(p_pupil_code)) and s.status <> ''Archived'''
  );
  if v_new = v_def then raise exception 'Could not protect parent PIN change'; end if;
  execute v_new;

  v_def := pg_get_functiondef('public.parent_reset_guardian_pin(text,text,text,text)'::regprocedure);
  v_new := replace(v_def,
    'where upper(s.admission_number)=upper(trim(p_pupil_code))',
    'where upper(s.admission_number)=upper(trim(p_pupil_code)) and s.status <> ''Archived'''
  );
  if v_new = v_def then raise exception 'Could not protect parent PIN reset'; end if;
  execute v_new;
end;
$migration$;
