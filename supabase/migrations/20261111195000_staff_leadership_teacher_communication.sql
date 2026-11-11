-- CORNHILL: allow academic leadership to coordinate directly with teachers
-- without granting Bursar/other Staff access to the Director-only channel.
--
-- Audience matrix:
--   Admin: all_staff, teachers, admins
--   Teacher: all_staff, teachers
--   Headteacher/DOS (Staff + academic-viewer helper): all_staff, teachers
--   Other Staff (including finance/operations): all_staff only
--
-- A non-admin author may read their own post even when the audience is a group
-- they are not a member of. They do not gain visibility into other group posts.

drop policy if exists staff_comm_posts_create
  on public.staff_communication_posts;
create policy staff_comm_posts_create
on public.staff_communication_posts
for insert
to authenticated
with check (
  public.is_active_staff_session()
  and author_user_id = (select auth.uid())
  and exists (
    select 1
    from public.user_profiles p
    where p.id = (select auth.uid())
      and (
        p.role = 'Admin'
        or (
          p.role = 'Teacher'
          and audience = any (array['all_staff','teachers']::text[])
        )
        or (
          p.role = 'Staff'
          and (
            audience = 'all_staff'
            or (
              audience = 'teachers'
              and public.is_school_academic_viewer()
            )
          )
        )
      )
  )
);

drop policy if exists staff_comm_posts_read
  on public.staff_communication_posts;
create policy staff_comm_posts_read
on public.staff_communication_posts
for select
to authenticated
using (
  public.is_active_staff_session()
  and (
    public.is_school_admin()
    or author_user_id = (select auth.uid())
    or audience = 'all_staff'
    or (
      audience = 'teachers'
      and (
        (select p.role from public.user_profiles p
         where p.id = (select auth.uid())) = 'Teacher'
        or public.is_school_academic_viewer()
      )
    )
    or (
      audience = 'admins'
      and (select p.role from public.user_profiles p
           where p.id = (select auth.uid())) = 'Admin'
    )
  )
);

drop policy if exists staff_comm_posts_update
  on public.staff_communication_posts;
create policy staff_comm_posts_update
on public.staff_communication_posts
for update
to authenticated
using (
  public.is_active_staff_session()
  and (
    public.is_school_admin()
    or author_user_id = (select auth.uid())
  )
)
with check (
  public.is_active_staff_session()
  and (
    public.is_school_admin()
    or (
      author_user_id = (select auth.uid())
      and exists (
        select 1
        from public.user_profiles p
        where p.id = (select auth.uid())
          and (
            (
              p.role = 'Teacher'
              and audience = any (array['all_staff','teachers']::text[])
            )
            or (
              p.role = 'Staff'
              and (
                audience = 'all_staff'
                or (
                  audience = 'teachers'
                  and public.is_school_academic_viewer()
                )
              )
            )
          )
      )
    )
  )
);
