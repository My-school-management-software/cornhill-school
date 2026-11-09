-- Align communications SELECT policies with the app's active-staff guard.
drop policy if exists "School staff read targeted notices" on public.school_staff_notices;
create policy "School staff read targeted notices"
on public.school_staff_notices for select to authenticated
using (
 (select public.is_school_admin())
 or (
   is_published=true
   and publish_at<=now()
   and (expires_at is null or expires_at>=now())
   and exists (
     select 1 from public.user_profiles p
     where p.id=(select auth.uid())
       and p.employment_status='Active'
       and p.role=any(school_staff_notices.audience_roles)
   )
 )
);
drop policy if exists "School staff read published calendar events" on public.school_calendar_events;
create policy "School staff read published calendar events"
on public.school_calendar_events for select to authenticated
using (
 (select public.is_school_admin())
 or (
   is_published=true
   and exists (
     select 1 from public.user_profiles p
     where p.id=(select auth.uid())
       and p.employment_status='Active'
       and p.role=any(school_calendar_events.audience_roles)
   )
 )
);
-- Visitor check-out UI changes only three fields. Prevent edits to identity, purpose, pass code or audit creator.
revoke update on public.school_visitor_log from authenticated;
grant update (status,checked_out_at,checked_out_by) on public.school_visitor_log to authenticated;
-- Asset-maintenance UI updates only workflow fields; identity and original report details remain immutable.
revoke update on public.school_asset_maintenance from authenticated;
grant update (status,actual_cost_ugx,resolution_note,updated_at,resolved_at) on public.school_asset_maintenance to authenticated;
