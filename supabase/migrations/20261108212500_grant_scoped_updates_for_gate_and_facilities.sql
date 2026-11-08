-- Give authenticated users only the columns needed by the RLS-protected visitor and facilities workflows.
-- Row-level policies still decide which user/job title can update each row.
revoke update on public.school_visitor_log from authenticated;
grant update(status,checked_out_at,checked_out_by) on public.school_visitor_log to authenticated;

revoke update on public.school_assets from authenticated;
grant update(location,condition,status,notes,updated_by,updated_at) on public.school_assets to authenticated;

revoke update on public.school_asset_maintenance from authenticated;
grant update(status,actual_cost_ugx,resolution_note,updated_at,resolved_at) on public.school_asset_maintenance to authenticated;

-- Do not grant anonymous access to these internal records.
revoke all on public.school_visitor_log,public.school_assets,public.school_asset_maintenance from anon;
