create or replace function public.is_active_staff_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.user_profiles p
      where p.id = (select auth.uid())
        and nullif(btrim(p.role), '') is not null
        and coalesce(p.employment_status, 'Active') = 'Active'
    );
$function$;

revoke all on function public.is_active_staff_session() from public;
revoke all on function public.is_active_staff_session() from anon;
grant execute on function public.is_active_staff_session() to authenticated;

do $block$
declare
  p record;
  clauses text;
begin
  for p in
    select c.relname as table_name, pol.polname as policy_name,
           pol.polqual, pol.polwithcheck, pol.polrelid
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'staff_communication_posts',
        'staff_communication_comments',
        'staff_communication_reactions',
        'staff_direct_messages',
        'staff_media_messages',
        'staff_call_signals'
      )
  loop
    clauses := '';
    if p.polqual is not null then
      clauses := clauses || format(
        ' USING (public.is_active_staff_session() AND (%s))',
        pg_get_expr(p.polqual, p.polrelid)
      );
    end if;
    if p.polwithcheck is not null then
      clauses := clauses || format(
        ' WITH CHECK (public.is_active_staff_session() AND (%s))',
        pg_get_expr(p.polwithcheck, p.polrelid)
      );
    end if;
    if clauses <> '' then
      execute format('ALTER POLICY %I ON public.%I%s',
        p.policy_name, p.table_name, clauses);
    end if;
  end loop;
end;
$block$;

comment on function public.is_active_staff_session() is
  'True only for a signed-in user with an active staff profile; used to prevent inactive accounts from accessing staff collaboration data.';
