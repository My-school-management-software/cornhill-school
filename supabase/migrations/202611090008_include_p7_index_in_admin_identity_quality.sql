-- Expand the administrator learner-identity quality summary to include
-- missing UNEB P7 index numbers. Identifiers are never generated here.
drop function if exists public.admin_learner_identity_quality_summary();

create function public.admin_learner_identity_quality_summary()
returns table(
  class_name text,
  total_learners bigint,
  missing_lin bigint,
  temporary_pupil_codes bigint,
  incomplete_admissions bigint,
  missing_p7_index bigint
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
    raise exception 'Only school administrators may view admission-quality totals' using errcode='42501';
  end if;

  return query
  select
    coalesce(c.name,'Unassigned')::text,
    count(*)::bigint,
    count(*) filter(where nullif(btrim(s.lin),'') is null)::bigint,
    count(*) filter(where s.admission_number like 'TMP%')::bigint,
    count(*) filter(where not s.admission_complete)::bigint,
    count(*) filter(where c.name='P7' and nullif(btrim(s.p7_index_number),'') is null)::bigint
  from public.students s
  left join public.school_classes c on c.id=s.class_id
  where s.status<>'Archived'
  group by c.name
  order by case when c.name is null then 1 else 0 end,c.name;
end;
$function$;

revoke all on function public.admin_learner_identity_quality_summary() from public,anon;
grant execute on function public.admin_learner_identity_quality_summary() to authenticated;
