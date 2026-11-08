-- Asset register UI edits only condition, location, status and notes.
-- Keep identifiers, purchase cost, provenance and creation metadata immutable to normal operators.
revoke update on public.school_assets from authenticated;
grant update (location,condition,status,notes,updated_by,updated_at) on public.school_assets to authenticated;
