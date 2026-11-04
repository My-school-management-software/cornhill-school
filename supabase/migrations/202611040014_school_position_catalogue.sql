create table if not exists public.school_position_catalogue (
 id uuid primary key default gen_random_uuid(),
 title text not null unique,
 department text not null,
 display_order integer not null default 100,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.school_position_catalogue enable row level security;
grant select,insert,update,delete on public.school_position_catalogue to authenticated;
create policy school_positions_read on public.school_position_catalogue for select to authenticated using (public.is_school_admin() or exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.role in ('Teacher','Staff')));
create policy school_positions_admin_manage on public.school_position_catalogue for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
insert into public.school_position_catalogue(title,department,display_order) values
('Director','School Leadership',10),('Headteacher','School Leadership',20),('Deputy Headteacher','School Leadership',30),('Director of Studies (DOS)','Academics',40),
('Main Bursar','Finance',50),('Deputy Bursar','Finance',60),
('Matron','Boarding & Welfare',70),('Patron','Boarding & Welfare',80),('Senior Woman','Student Welfare',90),('Senior Man','Student Welfare',100),
('Cook','Catering',110),('Store Manager','Stores',120),('Deputy Store Manager','Stores',130),
('Nursery Head','Nursery',140),('Lower Primary Section Head (P1–P4)','Lower Primary',150),('Upper Primary Section Head (P5–P7)','Upper Primary',160),('Class Teacher','Teaching Staff',170),('Subject Teacher','Teaching Staff',180)
on conflict(title) do update set department=excluded.department,display_order=excluded.display_order,is_active=true;