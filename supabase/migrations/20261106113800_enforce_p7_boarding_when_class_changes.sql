create or replace function public.normalize_student_meal_plan()
returns trigger language plpgsql set search_path=''
as $$
declare v_class_name text;
begin
 if new.class_id is not null then
  select name into v_class_name from public.school_classes where id=new.class_id;
  if v_class_name='P7' then new.learner_type:='Boarding'; end if;
 end if;
 if new.learner_type='Boarding' then
  new.takes_breakfast:=false;
  new.takes_lunch:=false;
 end if;
 return new;
end;
$$;
drop trigger if exists trg_normalize_student_meal_plan on public.students;
create trigger trg_normalize_student_meal_plan
before insert or update on public.students
for each row execute function public.normalize_student_meal_plan();