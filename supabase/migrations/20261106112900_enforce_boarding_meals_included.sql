create or replace function public.normalize_student_meal_plan()
returns trigger language plpgsql set search_path=''
as $$
begin
 if new.learner_type='Boarding' then
  new.takes_breakfast:=false;
  new.takes_lunch:=false;
 end if;
 return new;
end;
$$;
drop trigger if exists trg_normalize_student_meal_plan on public.students;
create trigger trg_normalize_student_meal_plan
before insert or update of learner_type,takes_breakfast,takes_lunch
on public.students for each row execute function public.normalize_student_meal_plan();
update public.students set takes_breakfast=false,takes_lunch=false
where learner_type='Boarding' and (coalesce(takes_breakfast,false) or coalesce(takes_lunch,false));
revoke all on function public.normalize_student_meal_plan() from public,anon,authenticated;