-- Enforce one class per class-teacher account and use that assignment for RLS.
-- The existing unique constraint on class_teacher_access.user_id guarantees
-- that a teacher account cannot be mapped to more than one class.

create or replace function public.is_class_teacher_for_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_teacher_access cta
    join public.user_profiles up on up.id = cta.user_id
    where cta.class_id = p_class_id
      and cta.user_id = (select auth.uid())
      and up.role = 'Teacher'
  );
$$;

revoke all on function public.is_class_teacher_for_class(uuid) from public;
grant execute on function public.is_class_teacher_for_class(uuid) to authenticated;

drop policy if exists "Teachers read own class access" on public.class_teacher_access;
drop policy if exists "Teachers read only their assigned class access" on public.class_teacher_access;

create policy "Teachers read only their assigned class access"
on public.class_teacher_access
for select
to authenticated
using (user_id = (select auth.uid()));
