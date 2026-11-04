alter table public.students add column if not exists lin text;
alter table public.students add column if not exists p7_index_number text;
create unique index if not exists students_lin_unique on public.students (upper(trim(lin))) where lin is not null and trim(lin)<>'';
create unique index if not exists students_p7_index_number_unique on public.students (upper(trim(p7_index_number))) where p7_index_number is not null and trim(p7_index_number)<>'';
create table if not exists public.school_curriculum_subjects (
 id uuid primary key default gen_random_uuid(),
 school_level_group text not null check (school_level_group in ('Nursery','P1-P3','P4-P7')),
 subject_id uuid not null references public.subjects(id) on delete cascade,
 display_order integer not null default 100,
 is_required boolean not null default true,
 unique(school_level_group,subject_id)
);
alter table public.school_curriculum_subjects enable row level security;
grant select,insert,update,delete on public.school_curriculum_subjects to authenticated;
drop policy if exists school_curriculum_read on public.school_curriculum_subjects;
create policy school_curriculum_read on public.school_curriculum_subjects for select to authenticated using (public.is_school_admin() or exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.role in ('Teacher','Staff')));
drop policy if exists school_curriculum_admin_manage on public.school_curriculum_subjects;
create policy school_curriculum_admin_manage on public.school_curriculum_subjects for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
insert into public.subjects(name,code) values
('Numbers','NUM'),('Language Development','LANG-DEV'),('Reading','READ'),('Health Habits','HEALTH'),('Social Development','SOC-DEV'),('Writing','WRITE'),('Drawing','DRAW'),('English','ENG'),('Mathematics','MTC'),('Literacy I','LIT-I'),('Literacy II','LIT-II'),('Local Language','LOC-LANG'),('Religious Education','RE'),('Science','SCI'),('Social Studies','SST')
on conflict(name) do nothing;
insert into public.school_curriculum_subjects(school_level_group,subject_id,display_order) select v.level_group,s.id,v.display_order from (values
('Nursery','Numbers',10),('Nursery','Language Development',20),('Nursery','Reading',30),('Nursery','Health Habits',40),('Nursery','Social Development',50),('Nursery','Writing',60),('Nursery','Drawing',70),
('P1-P3','English',10),('P1-P3','Mathematics',20),('P1-P3','Literacy I',30),('P1-P3','Literacy II',40),('P1-P3','Local Language',50),('P1-P3','Religious Education',60),
('P4-P7','English',10),('P4-P7','Mathematics',20),('P4-P7','Science',30),('P4-P7','Social Studies',40)
) v(level_group,subject_name,display_order) join public.subjects s on lower(s.name)=lower(v.subject_name)
on conflict(school_level_group,subject_id) do update set display_order=excluded.display_order,is_required=true;
