drop trigger if exists students_record_code_change on public.students;
create trigger students_record_code_change after update on public.students for each row
when (old.admission_number is distinct from new.admission_number) execute function public.record_learner_code_change();