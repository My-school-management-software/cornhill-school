create or replace function public.admin_list_learner_code_aliases()
returns table(student_id uuid,old_code text,current_code text)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then raise exception 'Only school administrators may search historical learner codes' using errcode='42501'; end if;
  return query select a.student_id,a.old_code,s.admission_number from public.learner_code_aliases a join public.students s on s.id=a.student_id where s.status<>'Archived' order by a.changed_at desc;
end;
$fn$;
revoke all on function public.admin_list_learner_code_aliases() from public,anon;
grant execute on function public.admin_list_learner_code_aliases() to authenticated;