-- Tighten profile table privileges at the API boundary.
-- RLS already limits reads to the signed-in user's own profile or administrators,
-- and limits profile updates to administrators. The client only needs SELECT/UPDATE.
revoke all privileges on table public.user_profiles from public, anon, authenticated;
grant select, update on table public.user_profiles to authenticated;
