create or replace function public.enforce_teacher_single_class_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.teacher_user_id is null then
    return new;
  end if;

  -- Serialize assignment changes for this teacher before checking other class rows.
  perform 1
  from public.user_profiles up
  where up.id = new.teacher_user_id
  for update;

  if not found then
    raise exception 'Teacher account profile does not exist.';
  end if;

  if exists (
    select 1
    from public.class_subjects cs
    where cs.teacher_user_id = new.teacher_user_id
      and cs.class_id <> new.class_id
      and cs.id is distinct from new.id
  ) then
    raise exception 'A class teacher can be assigned to only one class. Assign all their subjects within that class.';
  end if;

  return new;
end;
$$;

drop trigger if exists class_subjects_enforce_single_teacher_class on public.class_subjects;
create trigger class_subjects_enforce_single_teacher_class
before insert or update of teacher_user_id, class_id
on public.class_subjects
for each row
execute function public.enforce_teacher_single_class_assignment();

revoke all on function public.enforce_teacher_single_class_assignment() from public, anon, authenticated;
