-- The visitor portal exposes check-in to authorised reception/security staff and administrators.
-- Keep the actor, initial status and checkout fields constrained by the insert policy.
drop policy if exists "Authorised gate staff check visitors in" on public.school_visitor_log;
create policy "Administrators and authorised gate staff check visitors in"
on public.school_visitor_log for insert to authenticated
with check (
 checked_in_by=(select auth.uid()) and status='Checked In'
 and checked_out_at is null and checked_out_by is null
 and (
  (select public.is_school_admin())
  or exists (
   select 1 from public.user_profiles p
   where p.id=(select auth.uid()) and p.employment_status='Active'
    and lower(btrim(coalesce(p.job_title,''))) in
    ('receptionist','security officer','security guard','gatekeeper','front office','office administrator')
  )
 )
);
