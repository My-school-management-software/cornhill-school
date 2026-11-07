do $patch$
declare v_def text;
begin
  v_def:=pg_get_functiondef('public.teacher_visiting_day_lookup(text)'::regprocedure);
  if position('''pupil_code'',s.admission_number,' in v_def)>0 and position('''previous_code_entered''' in v_def)=0 then
    execute replace(v_def,'''pupil_code'',s.admission_number,','''pupil_code'',s.admission_number,''previous_code_entered'',upper(trim(p_pupil_code))<>upper(s.admission_number),');
  end if;
end;
$patch$;