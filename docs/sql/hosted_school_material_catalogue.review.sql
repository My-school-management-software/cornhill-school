-- REVIEW CANDIDATE ONLY: not installed. Run in isolated hosted schema before approval.
-- Catalogue phase: immutable published class/term assignments, no learner or payment records.
begin;
create table public.school_material_catalogue (
 id uuid primary key default gen_random_uuid(),
 class_id uuid not null references public.school_classes(id) on delete restrict,
 term_id uuid not null references public.academic_terms(id) on delete restrict,
 label text not null check (length(btrim(label)) between 1 and 100),
 label_key text generated always as (lower(btrim(label))) stored,
 category text not null check (category in ('general','scholastic')),
 unit text not null check (length(btrim(unit)) between 1 and 36),
 quantity integer not null check (quantity between 1 and 10000),
 duration text not null check (duration in ('annual','termly','once','custom')),
 starts_on date not null,
 ends_on date not null,
 created_by uuid not null default auth.uid() references public.user_profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 check (starts_on <= ends_on),
 unique (class_id,term_id,label_key)
);
alter table public.school_material_catalogue enable row level security;
revoke all on public.school_material_catalogue from public,anon,authenticated;
grant select on public.school_material_catalogue to authenticated;
grant insert (class_id,term_id,label,category,unit,quantity,duration,starts_on,ends_on) on public.school_material_catalogue to authenticated;
create policy material_catalogue_admin_read on public.school_material_catalogue for select to authenticated
 using ((select public.is_school_admin()));
create policy material_catalogue_admin_publish on public.school_material_catalogue for insert to authenticated
 with check ((select public.is_school_admin()) and created_by=(select auth.uid())
   and exists(select 1 from public.academic_terms t where t.id=school_material_catalogue.term_id and not t.is_closed and
       school_material_catalogue.starts_on=t.starts_on and
       ((school_material_catalogue.duration in ('termly','once') and school_material_catalogue.ends_on=t.ends_on)
        or (school_material_catalogue.duration='annual' and school_material_catalogue.ends_on=(school_material_catalogue.starts_on + interval '1 year' - interval '1 day')::date)
        or (school_material_catalogue.duration='custom' and school_material_catalogue.ends_on>=school_material_catalogue.starts_on))));
-- No UPDATE/DELETE grant. The later edition workflow needs independent review.
-- This table is a catalogue, not a delivery or clearance ledger. Annual/custom
-- cross-term applicability, learner assignment snapshots and custody remain separate.
commit;
