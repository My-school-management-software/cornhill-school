-- Configurable grading and administrator-approved learner reports.
create table if not exists public.academic_grade_bands (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 min_percent numeric(5,2) not null check(min_percent>=0 and min_percent<=100),
 max_percent numeric(5,2) not null check(max_percent>=0 and max_percent<=100),
 comment text,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 check(min_percent<=max_percent),
 unique(name)
);
create table if not exists public.report_card_publications (
 id uuid primary key default gen_random_uuid(),
 term_id uuid not null references public.academic_terms(id),
 class_id uuid not null references public.school_classes(id),
 student_id uuid not null references public.students(id),
 approved_by uuid not null references public.user_profiles(id),
 approved_at timestamptz not null default now(),
 unique(term_id,student_id)
);
alter table public.academic_grade_bands enable row level security;
alter table public.report_card_publications enable row level security;
drop policy if exists "Authenticated read grade bands" on public.academic_grade_bands;
create policy "Authenticated read grade bands" on public.academic_grade_bands for select to authenticated using(true);
drop policy if exists "Admins manage grade bands" on public.academic_grade_bands;
create policy "Admins manage grade bands" on public.academic_grade_bands for all to authenticated using(public.is_school_admin()) with check(public.is_school_admin());
drop policy if exists "Admins manage report publication" on public.report_card_publications;
create policy "Admins manage report publication" on public.report_card_publications for all to authenticated using(public.is_school_admin()) with check(public.is_school_admin() and approved_by=(select auth.uid()));
grant select,insert,update,delete on public.academic_grade_bands to authenticated;
grant select,insert,update,delete on public.report_card_publications to authenticated;
insert into public.academic_grade_bands(name,min_percent,max_percent,comment) values
('A',80,100,'Excellent'),('B',70,79.99,'Very good'),('C',60,69.99,'Good'),('D',50,59.99,'Fair'),('E',0,49.99,'Needs improvement')
on conflict(name) do nothing;
