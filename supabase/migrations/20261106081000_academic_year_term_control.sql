-- CORNHILL academic year and term controls.
-- Apply after the academic_years and academic_terms foundation migrations.

alter table public.academic_terms
 add column if not exists is_current boolean not null default false,
 add column if not exists is_closed boolean not null default false,
 add column if not exists closed_at timestamptz,
 add column if not exists closed_by uuid references auth.users(id) on delete set null;

do $$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.academic_terms'::regclass and conname='academic_terms_valid_dates') then
  alter table public.academic_terms add constraint academic_terms_valid_dates check (ends_on >= starts_on);
 end if;
end $$;

create unique index if not exists academic_years_one_current_idx on public.academic_years ((is_current)) where is_current;

create unique index if not exists academic_terms_one_current_idx
 on public.academic_terms ((is_current)) where is_current and not is_closed;

create or replace function public.admin_set_current_academic_term(p_term_id uuid)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare v_year_id uuid; v_end date; v_closed boolean;
begin
 if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
  raise exception 'Only a signed-in school administrator can change the active term' using errcode='42501';
 end if;
 select academic_year_id,ends_on,is_closed into v_year_id,v_end,v_closed
 from public.academic_terms where id=p_term_id for update;
 if not found then raise exception 'Selected term was not found'; end if;
 if v_closed then raise exception 'This term is closed. A closed term cannot be activated'; end if;
 if v_end < current_date then raise exception 'This term end date has passed. Extend the term dates first, or close the term'; end if;
 update public.academic_years set is_current=(id=v_year_id);
 update public.academic_terms set is_current=false where is_current;
 update public.academic_terms set is_current=true where id=p_term_id;
end $$;

create or replace function public.admin_close_academic_term(p_term_id uuid)
returns void language plpgsql security definer set search_path=public,auth
as $$
begin
 if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
  raise exception 'Only a signed-in school administrator can close a term' using errcode='42501';
 end if;
 update public.academic_terms set is_current=false,is_closed=true,closed_at=now(),closed_by=auth.uid()
 where id=p_term_id and not is_closed;
 if not found then raise exception 'Term was already closed or could not be found'; end if;
end $$;

create or replace function public.admin_close_expired_academic_terms()
returns integer language plpgsql security definer set search_path=public,auth
as $$
declare v_count integer;
begin
 if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
  raise exception 'Only a signed-in school administrator can process term closures' using errcode='42501';
 end if;
 update public.academic_terms set is_current=false,is_closed=true,closed_at=coalesce(closed_at,now()),closed_by=coalesce(closed_by,auth.uid())
 where not is_closed and ends_on < current_date;
 get diagnostics v_count=row_count;
 return v_count;
end $$;

revoke all on function public.admin_set_current_academic_term(uuid) from public,anon;
revoke all on function public.admin_close_academic_term(uuid) from public,anon;
revoke all on function public.admin_close_expired_academic_terms() from public,anon;
grant execute on function public.admin_set_current_academic_term(uuid) to authenticated;
grant execute on function public.admin_close_academic_term(uuid) to authenticated;
grant execute on function public.admin_close_expired_academic_terms() to authenticated;
