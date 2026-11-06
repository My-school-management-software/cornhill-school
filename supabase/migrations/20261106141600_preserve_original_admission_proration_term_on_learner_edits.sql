create or replace function public.set_learner_admission_proration_term()
returns trigger
language plpgsql
set search_path=''
as $function$
begin
 if tg_op='UPDATE'
   and new.admission_prorate is not distinct from old.admission_prorate
   and new.admission_date is not distinct from old.admission_date then
  new.admission_prorate_term_id:=old.admission_prorate_term_id;
  return new;
 end if;
 if new.admission_prorate then
  select t.id into new.admission_prorate_term_id
  from public.academic_terms t
  where t.is_current=true and not t.is_closed
   and coalesce(new.admission_date,(timezone('Africa/Kampala',now()))::date) between t.starts_on and t.ends_on
  order by t.starts_on desc limit 1;
  if new.admission_prorate_term_id is null then
   raise exception 'Mid-term proration requires an active term and an admission date within that term';
  end if;
 else
  new.admission_prorate_term_id:=null;
 end if;
 return new;
end;
$function$;
