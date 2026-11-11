-- CORNHILL: let subject-only teachers use the shared learning-resource workspace
-- for the exact class + subject assigned to their individual Teacher account.
--
-- Full class teachers retain their existing class-wide access. Subject-only teachers
-- must not be inserted into full-class assignment tables. Subject names are matched
-- against the canonical public.subjects.name value because the existing resource
-- table stores subject as text rather than a subject_id foreign key.

create or replace function public.can_teacher_view_learning_resource(
  p_class_id uuid,
  p_subject text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    public.is_school_admin()
    or public.is_class_teacher_for_class(p_class_id)
    or exists (
      select 1
      from public.user_profiles up
      join public.class_subjects cs
        on cs.class_id = p_class_id
      join public.subjects sub
        on sub.id = cs.subject_id
      left join public.academic_teacher_directory td
        on td.id = cs.teacher_directory_id
      where up.id = (select auth.uid())
        and up.role = 'Teacher'
        and coalesce(up.employment_status, 'Active') = 'Active'
        and lower(btrim(coalesce(sub.name, ''))) = lower(btrim(coalesce(p_subject, '')))
        and (
          cs.teacher_user_id = (select auth.uid())
          or td.linked_user_id = (select auth.uid())
        )
        and (cs.starts_on is null or cs.starts_on <= current_date)
        and (cs.ends_on is null or cs.ends_on >= current_date)
        and cs.can_view_reports
    );
$function$;

create or replace function public.can_teacher_manage_learning_resource(
  p_class_id uuid,
  p_subject text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    public.is_school_admin()
    or public.is_class_teacher_for_class(p_class_id)
    or exists (
      select 1
      from public.user_profiles up
      join public.class_subjects cs
        on cs.class_id = p_class_id
      join public.subjects sub
        on sub.id = cs.subject_id
      left join public.academic_teacher_directory td
        on td.id = cs.teacher_directory_id
      where up.id = (select auth.uid())
        and up.role = 'Teacher'
        and coalesce(up.employment_status, 'Active') = 'Active'
        and lower(btrim(coalesce(sub.name, ''))) = lower(btrim(coalesce(p_subject, '')))
        and (
          cs.teacher_user_id = (select auth.uid())
          or td.linked_user_id = (select auth.uid())
        )
        and (cs.starts_on is null or cs.starts_on <= current_date)
        and (cs.ends_on is null or cs.ends_on >= current_date)
        and cs.can_enter_marks
    );
$function$;

revoke all on function public.can_teacher_view_learning_resource(uuid, text)
  from public, anon;
revoke all on function public.can_teacher_manage_learning_resource(uuid, text)
  from public, anon;
grant execute on function public.can_teacher_view_learning_resource(uuid, text)
  to authenticated;
grant execute on function public.can_teacher_manage_learning_resource(uuid, text)
  to authenticated;

drop policy if exists "Admins and assigned teachers read learning resources"
  on public.school_learning_resources;
create policy "Admins and assigned teachers read learning resources"
on public.school_learning_resources
for select
to authenticated
using (
  public.can_teacher_view_learning_resource(class_id, subject)
);

drop policy if exists "Admins and assigned teachers add learning resources"
  on public.school_learning_resources;
create policy "Admins and assigned teachers add learning resources"
on public.school_learning_resources
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.can_teacher_manage_learning_resource(class_id, subject)
);

drop policy if exists "Admins and resource owners delete learning resources"
  on public.school_learning_resources;
create policy "Admins and resource owners delete learning resources"
on public.school_learning_resources
for delete
to authenticated
using (
  public.is_school_admin()
  or (
    created_by = (select auth.uid())
    and public.can_teacher_manage_learning_resource(class_id, subject)
  )
);

drop policy if exists "Admins and resource owners update learning resources"
  on public.school_learning_resources;
create policy "Admins and resource owners update learning resources"
on public.school_learning_resources
for update
to authenticated
using (
  public.is_school_admin()
  or (
    created_by = (select auth.uid())
    and public.can_teacher_manage_learning_resource(class_id, subject)
  )
)
with check (
  public.is_school_admin()
  or (
    created_by = (select auth.uid())
    and public.can_teacher_manage_learning_resource(class_id, subject)
  )
);
