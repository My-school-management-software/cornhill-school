-- Cover the creator/author foreign keys used by RLS and internal staff collaboration queries.
create index if not exists school_calendar_events_created_by_idx on public.school_calendar_events(created_by);
create index if not exists school_staff_notices_created_by_idx on public.school_staff_notices(created_by);
create index if not exists staff_communication_comments_author_user_id_idx on public.staff_communication_comments(author_user_id);
create index if not exists staff_communication_posts_author_user_id_idx on public.staff_communication_posts(author_user_id);
create index if not exists staff_communication_reactions_user_id_idx on public.staff_communication_reactions(user_id);
