-- Allow signed-in school users to reach the students table through the Data API.
-- Row-level security remains the authorization boundary: administrators manage
-- records, while administrators and assigned class teachers retain scoped reads.
grant select, insert, update, delete on table public.students to authenticated;
