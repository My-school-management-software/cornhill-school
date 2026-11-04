create table if not exists public.staff_communication_posts (
 id uuid primary key default gen_random_uuid(),
 author_user_id uuid not null references public.user_profiles(id) on delete restrict,
 body text not null check (char_length(btrim(body)) between 1 and 5000),
 audience text not null default 'all_staff' check (audience in ('all_staff','teachers','admins')),
 is_pinned boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.staff_communication_comments (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references public.staff_communication_posts(id) on delete cascade,
 author_user_id uuid not null references public.user_profiles(id) on delete restrict,
 body text not null check (char_length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create table if not exists public.staff_communication_reactions (
 post_id uuid not null references public.staff_communication_posts(id) on delete cascade,
 user_id uuid not null references public.user_profiles(id) on delete cascade,
 reaction text not null default 'like' check (reaction in ('like','helpful','thanks')),
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create index if not exists staff_comm_posts_created_idx on public.staff_communication_posts(created_at desc);
create index if not exists staff_comm_comments_post_idx on public.staff_communication_comments(post_id,created_at);
alter table public.staff_communication_posts enable row level security;
alter table public.staff_communication_comments enable row level security;
alter table public.staff_communication_reactions enable row level security;
grant select, insert, update, delete on public.staff_communication_posts to authenticated;
grant select, insert, delete on public.staff_communication_comments to authenticated;
grant select, insert, delete on public.staff_communication_reactions to authenticated;
create policy staff_comm_posts_read on public.staff_communication_posts for select to authenticated using (public.is_school_admin() or audience='all_staff' or audience=(select role from public.user_profiles where id=(select auth.uid())));
create policy staff_comm_posts_create on public.staff_communication_posts for insert to authenticated with check (author_user_id=(select auth.uid()) and exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.role in ('Admin','Teacher','Staff')));
create policy staff_comm_posts_update on public.staff_communication_posts for update to authenticated using (author_user_id=(select auth.uid()) or public.is_school_admin()) with check (author_user_id=(select auth.uid()) or public.is_school_admin());
create policy staff_comm_posts_delete on public.staff_communication_posts for delete to authenticated using (author_user_id=(select auth.uid()) or public.is_school_admin());
create policy staff_comm_comments_read on public.staff_communication_comments for select to authenticated using (exists(select 1 from public.staff_communication_posts p where p.id=post_id));
create policy staff_comm_comments_create on public.staff_communication_comments for insert to authenticated with check (author_user_id=(select auth.uid()) and exists(select 1 from public.staff_communication_posts p where p.id=post_id));
create policy staff_comm_comments_delete on public.staff_communication_comments for delete to authenticated using (author_user_id=(select auth.uid()) or public.is_school_admin());
create policy staff_comm_reactions_read on public.staff_communication_reactions for select to authenticated using (exists(select 1 from public.staff_communication_posts p where p.id=post_id));
create policy staff_comm_reactions_create on public.staff_communication_reactions for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.staff_communication_posts p where p.id=post_id));
create policy staff_comm_reactions_delete on public.staff_communication_reactions for delete to authenticated using (user_id=(select auth.uid()) or public.is_school_admin());
