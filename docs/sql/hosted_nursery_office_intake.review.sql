-- REVIEW ONLY; depends on hosted_school_material_catalogue.review.sql.
-- First phase: current open term, Nursery scholastic materials, existing school
-- administrator role. Do not deploy to production until negative role, concurrency,
-- RLS, idempotency, migration and restored-clone tests pass.
begin;
create schema if not exists cornhill_material_private;
revoke all on schema cornhill_material_private from public,anon,authenticated;
grant usage on schema cornhill_material_private to authenticated;
create table public.school_nursery_office_deliveries(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 catalogue_id uuid not null references public.school_material_catalogue(id) on delete restrict,
 student_id uuid not null references public.students(id) on delete restrict,
 quantity integer not null check(quantity between 1 and 10000),
 received_by uuid not null references public.user_profiles(id) on delete restrict,
 received_at timestamptz not null default now()
);
alter table public.school_nursery_office_deliveries enable row level security;
revoke all on public.school_nursery_office_deliveries from public,anon,authenticated;
grant select on public.school_nursery_office_deliveries to authenticated;
create policy nursery_office_admin_read on public.school_nursery_office_deliveries for select to authenticated using ((select public.is_school_admin()));
create index nursery_office_delivery_lookup on public.school_nursery_office_deliveries(student_id,catalogue_id);
create function cornhill_material_private.record_delivery(p_request_id uuid,p_catalogue_id uuid,p_student_id uuid,p_quantity integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_old public.school_nursery_office_deliveries%rowtype; v_catalogue public.school_material_catalogue%rowtype; v_used bigint; v_id uuid;
begin
 if v_actor is null or not coalesce(public.is_school_admin(),false) then raise exception 'Office administrator access required' using errcode='42501'; end if;
 if p_request_id is null or p_catalogue_id is null or p_student_id is null or p_quantity is null or p_quantity<1 or p_quantity>10000 then raise exception 'Invalid delivery' using errcode='22023'; end if;
 -- Serialize all receipts for this immutable catalogue assignment; check retries after lock.
 select * into v_catalogue from public.school_material_catalogue where id=p_catalogue_id for update;
 if not found then raise exception 'Requirement unavailable'; end if;
 select * into v_old from public.school_nursery_office_deliveries where request_id=p_request_id;
 if found then
   if v_old.received_by<>v_actor or v_old.catalogue_id<>p_catalogue_id or v_old.student_id<>p_student_id or v_old.quantity<>p_quantity then raise exception 'Request conflict'; end if;
   return v_old.id;
 end if;
 if v_catalogue.category<>'scholastic' or not exists(select 1 from public.school_classes c where c.id=v_catalogue.class_id and c.name in ('Baby','Middle','Top')) then raise exception 'Nursery scholastic materials only'; end if;
 if not exists(select 1 from public.academic_terms t where t.id=v_catalogue.term_id and t.is_current and not t.is_closed) then raise exception 'Current open term required'; end if;
 perform 1 from public.students s where s.id=p_student_id and s.class_id=v_catalogue.class_id and s.status='Active' for share;
 if not found then raise exception 'Learner outside active class'; end if;
 select coalesce(sum(d.quantity),0) into v_used from public.school_nursery_office_deliveries d where d.student_id=p_student_id and d.catalogue_id=p_catalogue_id;
 if p_quantity>v_catalogue.quantity-v_used then raise exception 'Delivery exceeds outstanding quantity'; end if;
 insert into public.school_nursery_office_deliveries(request_id,catalogue_id,student_id,quantity,received_by) values(p_request_id,p_catalogue_id,p_student_id,p_quantity,v_actor) returning id into v_id;
 return v_id;
end; $$;
revoke all on function cornhill_material_private.record_delivery(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function cornhill_material_private.record_delivery(uuid,uuid,uuid,integer) to authenticated;
create function public.record_nursery_office_delivery(p_request_id uuid,p_catalogue_id uuid,p_student_id uuid,p_quantity integer)
returns uuid language sql security invoker set search_path = '' as $$
 select cornhill_material_private.record_delivery(p_request_id,p_catalogue_id,p_student_id,p_quantity);
$$;
revoke all on function public.record_nursery_office_delivery(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.record_nursery_office_delivery(uuid,uuid,uuid,integer) to authenticated;
-- Corrections/reversals, delegation, teacher read access, multi-term applicability,
-- custody handovers and print acceptance are separate release gates.
commit;
