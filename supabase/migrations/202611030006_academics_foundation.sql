-- Academic year, term, subject, class offering, assessment and score foundation.
create table if not exists public.academic_years (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 starts_on date not null, ends_on date not null, is_current boolean not null default false,
 created_at timestamptz not null default now(), constraint academic_year_dates_check check (ends_on >= starts_on)
);
create unique index if not exists academic_years_one_current_idx on public.academic_years (is_current) where is_current;
create table if not exists public.academic_terms (
 id uuid primary key default gen_random_uuid(), academic_year_id uuid not null references public.academic_years(id) on delete cascade,
 name text not null, starts_on date not null, ends_on date not null, created_at timestamptz not null default now(),
 unique (academic_year_id,name), constraint academic_term_dates_check check (ends_on >= starts_on)
);
create table if not exists public.subjects (
 id uuid primary key default gen_random_uuid(), name text not null unique, code text unique,
 is_active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.class_subjects (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.school_classes(id) on delete cascade,
 subject_id uuid not null references public.subjects(id) on delete restrict,
 teacher_user_id uuid references public.user_profiles(id) on delete set null, created_at timestamptz not null default now(),
 unique (class_id,subject_id)
);
create table if not exists public.assessments (
 id uuid primary key default gen_random_uuid(), term_id uuid not null references public.academic_terms(id) on delete cascade,
 class_id uuid not null references public.school_classes(id) on delete cascade,
 subject_id uuid not null references public.subjects(id) on delete restrict, title text not null,
 assessment_type text not null default 'Coursework' check (assessment_type in ('Coursework','Test','Examination','Project','Practical')),
 max_score numeric(7,2) not null check (max_score > 0), assessment_date date,
 created_by uuid not null references public.user_profiles(id), created_at timestamptz not null default now(),
 unique (term_id,class_id,subject_id,title)
);
create table if not exists public.assessment_scores (
 id uuid primary key default gen_random_uuid(), assessment_id uuid not null references public.assessments(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 score numeric(7,2) not null check (score >= 0), teacher_comment text,
 entered_by uuid not null references public.user_profiles(id), updated_at timestamptz not null default now(),
 unique (assessment_id,student_id)
);
create index if not exists academic_terms_year_idx on public.academic_terms(academic_year_id);
create index if not exists class_subjects_class_idx on public.class_subjects(class_id);
create index if not exists class_subjects_teacher_idx on public.class_subjects(teacher_user_id);
create index if not exists assessments_class_term_idx on public.assessments(class_id,term_id);
create index if not exists assessment_scores_student_idx on public.assessment_scores(student_id);
create index if not exists assessment_scores_assessment_idx on public.assessment_scores(assessment_id);
alter table public.academic_years enable row level security;
alter table public.academic_terms enable row level security;
alter table public.subjects enable row level security;
alter table public.class_subjects enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_scores enable row level security;
create policy "Authenticated users can read academic years" on public.academic_years for select to authenticated using (true);
create policy "Admins manage academic years" on public.academic_years for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "Authenticated users can read academic terms" on public.academic_terms for select to authenticated using (true);
create policy "Admins manage academic terms" on public.academic_terms for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "Authenticated users can read subjects" on public.subjects for select to authenticated using (true);
create policy "Admins manage subjects" on public.subjects for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "Authenticated users can read class subjects" on public.class_subjects for select to authenticated using (true);
create policy "Admins manage class subjects" on public.class_subjects for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "Authenticated users can read assessments" on public.assessments for select to authenticated using (true);
create policy "Admins manage assessments" on public.assessments for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
create policy "Authenticated users can read scores" on public.assessment_scores for select to authenticated using (true);
create policy "Admins manage scores" on public.assessment_scores for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
grant select,insert,update,delete on public.academic_years,public.academic_terms,public.subjects,public.class_subjects,public.assessments,public.assessment_scores to authenticated;

create or replace function public.validate_assessment_score()
returns trigger language plpgsql set search_path = ''
as $function$
declare v_max numeric(7,2); v_class uuid;
begin
 select a.max_score,a.class_id into v_max,v_class from public.assessments a where a.id=new.assessment_id;
 if v_max is null then raise exception 'Assessment does not exist'; end if;
 if new.score > v_max then raise exception 'Score cannot exceed the assessment maximum (%)',v_max; end if;
 if not exists (select 1 from public.students s where s.id=new.student_id and s.class_id=v_class) then
  raise exception 'Learner does not belong to the assessment class';
 end if;
 new.updated_at=now(); return new;
end;
$function$;
drop trigger if exists validate_assessment_score_before_write on public.assessment_scores;
create trigger validate_assessment_score_before_write before insert or update on public.assessment_scores
for each row execute function public.validate_assessment_score();
