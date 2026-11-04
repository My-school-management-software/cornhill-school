-- Store UNEB PLE grade codes and subject-specific percentage boundaries separately
-- from the general A-E bands used by Nursery and P1-P3.
create table if not exists public.uneb_subject_grade_bands (
 id uuid primary key default gen_random_uuid(),
 subject_id uuid not null references public.subjects(id) on delete cascade,
 grade_code text not null check (grade_code in ('D1','D2','C3','C4','C5','C6','P7','P8','F9')),
 grade_point smallint not null check (grade_point between 1 and 9),
 min_percent numeric(5,2),
 max_percent numeric(5,2),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check ((min_percent is null and max_percent is null) or
        (min_percent between 0 and 100 and max_percent between 0 and 100 and min_percent <= max_percent)),
 unique(subject_id, grade_code),
 unique(subject_id, grade_point)
);
alter table public.uneb_subject_grade_bands enable row level security;
drop policy if exists "Authenticated read UNEB grade bands" on public.uneb_subject_grade_bands;
create policy "Authenticated read UNEB grade bands"
 on public.uneb_subject_grade_bands for select to authenticated using (true);
drop policy if exists "Admins manage UNEB grade bands" on public.uneb_subject_grade_bands;
create policy "Admins manage UNEB grade bands"
 on public.uneb_subject_grade_bands for all to authenticated
 using (public.is_school_admin()) with check (public.is_school_admin());
grant select, insert, update, delete on public.uneb_subject_grade_bands to authenticated;

insert into public.uneb_subject_grade_bands(subject_id, grade_code, grade_point)
select s.id, g.grade_code, g.grade_point
from public.subjects s
cross join (values
 ('D1',1),('D2',2),('C3',3),('C4',4),('C5',5),('C6',6),('P7',7),('P8',8),('F9',9)
) as g(grade_code,grade_point)
where lower(s.name) in ('english','mathematics','science','social studies')
on conflict(subject_id, grade_code) do nothing;
