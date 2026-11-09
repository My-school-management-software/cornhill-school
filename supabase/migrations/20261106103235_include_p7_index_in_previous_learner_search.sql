drop function if exists public.admin_find_learner_matches(text,text,text,date,integer,text,text);
create function public.admin_find_learner_matches(p_first_name text,p_last_name text,p_middle_name text default null,p_date_of_birth date default null,p_birth_year integer default null,p_lin text default null,p_p7_index_number text default null,p_guardian_phone text default null)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_school_admin() then raise exception 'Only school administrators may search previous learner records' using errcode='42501';end if;
 return query select to_jsonb(x) from (
  select s.id,s.admission_number,s.first_name,s.middle_name,s.last_name,s.gender,s.date_of_birth,s.birth_year,s.lin,s.p7_index_number,s.status,s.admission_date,c.name class_name,
   case when nullif(btrim(p_lin),'') is not null and lower(coalesce(s.lin,''))=lower(btrim(p_lin)) then 100
    when nullif(btrim(p_p7_index_number),'') is not null and lower(coalesce(s.p7_index_number,''))=lower(btrim(p_p7_index_number)) then 100
    when nullif(regexp_replace(coalesce(p_guardian_phone,''),'[^0-9]','','g'),'') is not null and regexp_replace(coalesce(s.guardian_phone,''),'[^0-9]','','g')=regexp_replace(p_guardian_phone,'[^0-9]','','g') then 90
    when p_date_of_birth is not null and s.date_of_birth=p_date_of_birth and lower(s.first_name)=lower(btrim(p_first_name)) and lower(s.last_name)=lower(btrim(p_last_name)) then 95
    when p_birth_year is not null and s.birth_year=p_birth_year and lower(s.first_name)=lower(btrim(p_first_name)) and lower(s.last_name)=lower(btrim(p_last_name)) then 75 else 50 end match_score
  from public.students s left join public.school_classes c on c.id=s.class_id
  where (nullif(btrim(p_lin),'') is not null and lower(coalesce(s.lin,''))=lower(btrim(p_lin)))
   or (nullif(btrim(p_p7_index_number),'') is not null and lower(coalesce(s.p7_index_number,''))=lower(btrim(p_p7_index_number)))
   or (nullif(regexp_replace(coalesce(p_guardian_phone,''),'[^0-9]','','g'),'') is not null and regexp_replace(coalesce(s.guardian_phone,''),'[^0-9]','','g')=regexp_replace(p_guardian_phone,'[^0-9]','','g'))
   or (lower(s.first_name)=lower(btrim(coalesce(p_first_name,''))) and lower(s.last_name)=lower(btrim(coalesce(p_last_name,'')))
    and (p_date_of_birth is null or s.date_of_birth=p_date_of_birth or (p_birth_year is not null and s.birth_year=p_birth_year) or (p_date_of_birth is null and p_birth_year is null)))
  order by match_score desc,s.admission_date desc limit 10
 ) x;
end;$$;
revoke all on function public.admin_find_learner_matches(text,text,text,date,integer,text,text,text) from public,anon;
grant execute on function public.admin_find_learner_matches(text,text,text,date,integer,text,text,text) to authenticated;