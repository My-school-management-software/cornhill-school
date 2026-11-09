create schema if not exists private;
revoke all on schema private from public,anon,authenticated;

create table if not exists public.learner_code_aliases (
  code_normalized text primary key, old_code text not null, new_code text not null,
  student_id uuid not null references public.students(id) on delete cascade,
  changed_at timestamptz not null default now(), changed_by uuid references auth.users(id) on delete set null,
  reason text not null
);
create index if not exists learner_code_aliases_student_idx on public.learner_code_aliases(student_id,changed_at desc);
alter table public.learner_code_aliases enable row level security;
revoke all on public.learner_code_aliases from public,anon,authenticated;

create table if not exists public.learner_code_change_audit (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete restrict,
  old_code text not null,new_code text not null,old_gender text not null,new_gender text not null,
  old_birth_year integer,new_birth_year integer,old_date_of_birth date,new_date_of_birth date,
  changed_at timestamptz not null default now(),changed_by uuid references auth.users(id) on delete set null,reason text not null
);
create index if not exists learner_code_change_audit_student_idx on public.learner_code_change_audit(student_id,changed_at desc);
alter table public.learner_code_change_audit enable row level security;
revoke all on public.learner_code_change_audit from public,anon,authenticated;

create or replace function private.resolve_learner_id_by_code(p_code text)
returns uuid language plpgsql stable security definer set search_path = ''
as $fn$
declare v_id uuid; v_code text:=upper(btrim(coalesce(p_code,'')));
begin
  if v_code='' then return null; end if;
  select s.id into v_id from public.students s where upper(s.admission_number)=v_code and s.status<>'Archived' limit 1;
  if v_id is not null then return v_id; end if;
  select s.id into v_id from public.learner_code_aliases a join public.students s on s.id=a.student_id
    where a.code_normalized=v_code and s.status<>'Archived' limit 1;
  return v_id;
end;
$fn$;
revoke all on function private.resolve_learner_id_by_code(text) from public,anon,authenticated;
grant execute on function private.resolve_learner_id_by_code(text) to postgres;

create or replace function public.assign_permanent_learner_code()
returns trigger language plpgsql set search_path = ''
as $fn$
declare v_sequence bigint; v_birth_year integer; v_old_birth_year integer; v_gender_letter text; v_random_letters text; v_year_fields_changed boolean:=false;
begin
  v_birth_year:=coalesce(new.birth_year,extract(year from new.date_of_birth)::integer);
  if tg_op='INSERT' then
    if new.date_of_birth is not null and new.birth_year is not null and new.birth_year<>extract(year from new.date_of_birth)::integer then
      raise exception 'Year of birth and date of birth must have the same year. Correct both fields before saving.';
    end if;
  else
    v_year_fields_changed:=new.birth_year is distinct from old.birth_year or new.date_of_birth is distinct from old.date_of_birth;
    if new.date_of_birth is not null and new.birth_year is not null and new.birth_year<>extract(year from new.date_of_birth)::integer and v_year_fields_changed then
      raise exception 'Year of birth and date of birth must have the same year. Correct both fields before saving.';
    end if;
  end if;
  if tg_op='UPDATE' and old.admission_number not like 'TMP%' then
    v_old_birth_year:=coalesce(old.birth_year,extract(year from old.date_of_birth)::integer);
    if new.gender not in ('Male','Female') or v_birth_year is null or v_birth_year<1900 or v_birth_year>extract(year from pg_catalog.now())::integer then
      raise exception 'A valid gender and year of birth are required to maintain a permanent learner code.';
    end if;
    new.birth_year:=v_birth_year;
    if new.gender is distinct from old.gender or v_birth_year is distinct from v_old_birth_year then
      v_gender_letter:=case new.gender when 'Male' then 'M' when 'Female' then 'F' end;
      v_sequence:=pg_catalog.nextval('public.student_admission_sequence'::regclass);
      if v_sequence>9999 then raise exception 'The four-digit admission sequence is full. Please contact the system administrator.'; end if;
      v_random_letters:=pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1)||
        pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1);
      new.admission_number:='CH'||pg_catalog.right(v_birth_year::text,2)||v_gender_letter||pg_catalog.lpad(v_sequence::text,4,'0')||v_random_letters;
    else new.admission_number:=old.admission_number; end if;
    new.admission_year:=old.admission_year;
    new.admission_complete:=(new.gender in ('Male','Female') and new.date_of_birth is not null and nullif(pg_catalog.btrim(new.lin),'') is not null and nullif(pg_catalog.btrim(new.guardian_name),'') is not null and nullif(pg_catalog.btrim(new.guardian_phone),'') is not null);
    return new;
  end if;
  if new.gender not in ('Male','Female') or v_birth_year is null or v_birth_year<1900 or v_birth_year>extract(year from pg_catalog.now())::integer then
    if tg_op='INSERT' then new.admission_number:='TMP'||pg_catalog.upper(pg_catalog.substr(pg_catalog.md5(pg_catalog.random()::text||pg_catalog.clock_timestamp()::text),1,9)); end if;
    new.admission_complete:=false; return new;
  end if;
  new.birth_year:=v_birth_year;
  v_gender_letter:=case new.gender when 'Male' then 'M' when 'Female' then 'F' end;
  v_sequence:=pg_catalog.nextval('public.student_admission_sequence'::regclass);
  if v_sequence>9999 then raise exception 'The four-digit admission sequence is full. Please contact the system administrator.'; end if;
  v_random_letters:=pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1)||
    pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1);
  new.admission_year:=extract(year from pg_catalog.timezone('Africa/Kampala',now()))::integer;
  new.admission_number:='CH'||pg_catalog.right(v_birth_year::text,2)||v_gender_letter||pg_catalog.lpad(v_sequence::text,4,'0')||v_random_letters;
  new.admission_complete:=(new.gender in ('Male','Female') and new.date_of_birth is not null and nullif(pg_catalog.btrim(new.lin),'') is not null and nullif(pg_catalog.btrim(new.guardian_name),'') is not null and nullif(pg_catalog.btrim(new.guardian_phone),'') is not null);
  return new;
end;
$fn$;

create or replace function public.prevent_permanent_learner_code_change()
returns trigger language plpgsql set search_path = ''
as $fn$
begin
  if old.admission_number not like 'TMP%' then
    if new.admission_year is distinct from old.admission_year then raise exception 'The original admission year cannot be changed.'; end if;
    if new.admission_number is distinct from old.admission_number and new.gender is not distinct from old.gender
       and coalesce(new.birth_year,extract(year from new.date_of_birth)::integer) is not distinct from coalesce(old.birth_year,extract(year from old.date_of_birth)::integer) then
      raise exception 'A permanent pupil code can only be regenerated when correcting gender or year of birth.';
    end if;
    if new.admission_number is distinct from old.admission_number and new.admission_number not like 'CH%' then
      raise exception 'A regenerated learner code must use the CORNHILL code format.';
    end if;
  end if;
  if old.admission_number like 'TMP%' and new.admission_number is distinct from old.admission_number and new.admission_number not like 'CH%' then
    raise exception 'A temporary learner code can only be replaced by a valid permanent school code.';
  end if;
  return new;
end;
$fn$;

create or replace function public.record_learner_code_change()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare v_reason text;
begin
  if old.admission_number is not distinct from new.admission_number then return new; end if;
  if exists(select 1 from public.students s where upper(s.admission_number)=upper(old.admission_number) and s.id<>new.id)
     or exists(select 1 from public.learner_code_aliases a where a.code_normalized=upper(old.admission_number) and a.student_id<>new.id) then
    raise exception 'The previous learner code is already associated with another learner.';
  end if;
  v_reason:=concat_ws('; ',
    case when old.gender is distinct from new.gender then 'Gender corrected from '||old.gender||' to '||new.gender end,
    case when coalesce(old.birth_year,extract(year from old.date_of_birth)::integer) is distinct from coalesce(new.birth_year,extract(year from new.date_of_birth)::integer)
      then 'Year of birth corrected from '||coalesce(old.birth_year::text,'unknown')||' to '||coalesce(new.birth_year::text,'unknown') end,
    'Pupil code regenerated while preserving the learner record');
  insert into public.learner_code_aliases(code_normalized,old_code,new_code,student_id,changed_by,reason)
    values(upper(btrim(old.admission_number)),old.admission_number,new.admission_number,new.id,auth.uid(),v_reason) on conflict(code_normalized) do nothing;
  insert into public.learner_code_change_audit(student_id,old_code,new_code,old_gender,new_gender,old_birth_year,new_birth_year,old_date_of_birth,new_date_of_birth,changed_by,reason)
    values(new.id,old.admission_number,new.admission_number,old.gender,new.gender,old.birth_year,new.birth_year,old.date_of_birth,new.date_of_birth,auth.uid(),v_reason);
  insert into public.school_notifications(category,severity,title,message,student_id,audience_role,action_workspace,source_key)
    values('learner_code_change','warning','Learner pupil code updated',
      'The pupil code for '||trim(concat_ws(' ',new.first_name,new.middle_name,new.last_name))||' changed from '||old.admission_number||' to '||new.admission_number||'. Use the new code for future records. The learner’s existing history remains linked.',
      new.id,'Admin','students','learner-code-change-admin:'||new.id::text||':'||new.admission_number) on conflict(source_key) do nothing;
  insert into public.school_notifications(category,severity,title,message,student_id,recipient_user_id,action_workspace,source_key)
    select 'learner_code_change','warning','Learner pupil code updated',
      'The pupil code for '||trim(concat_ws(' ',new.first_name,new.middle_name,new.last_name))||' changed from '||old.admission_number||' to '||new.admission_number||'. Use the new code for future records. Existing academic history remains attached.',
      new.id,cta.user_id,'students','learner-code-change-teacher:'||new.id::text||':'||new.admission_number||':'||cta.user_id::text
    from public.class_teacher_access cta where cta.class_id in (old.class_id,new.class_id) and cta.user_id is not null on conflict(source_key) do nothing;
  return new;
end;
$fn$;
drop trigger if exists students_record_code_change on public.students;
create trigger students_record_code_change after update on public.students for each row
when (old.admission_number is distinct from new.admission_number) execute function public.record_learner_code_change();
revoke all on function public.record_learner_code_change() from public,anon,authenticated;

do $patch$
declare v_def text;
begin
  v_def:=pg_get_functiondef('public.parent_portal_get_learner(text)'::regprocedure);
  v_def:=replace(v_def,'upper(s.admission_number) = upper(trim(p_pupil_code))','s.id = private.resolve_learner_id_by_code(p_pupil_code)');
  execute v_def;
  v_def:=pg_get_functiondef('public.parent_portal_get_learner_with_pin(text,text,text)'::regprocedure);
  v_def:=replace(v_def,'upper(s.admission_number)=upper(trim(p_pupil_code))','s.id=private.resolve_learner_id_by_code(p_pupil_code)');
  v_def:=replace(v_def,'upper(s.admission_number) = upper(trim(p_pupil_code))','s.id = private.resolve_learner_id_by_code(p_pupil_code)');
  execute v_def;
  v_def:=pg_get_functiondef('public.parent_change_guardian_pin(text,text,text,text)'::regprocedure);
  execute replace(v_def,'upper(s.admission_number)=upper(trim(p_pupil_code))','s.id=private.resolve_learner_id_by_code(p_pupil_code)');
  v_def:=pg_get_functiondef('public.parent_reset_guardian_pin(text,text,text,text)'::regprocedure);
  execute replace(v_def,'upper(s.admission_number)=upper(trim(p_pupil_code))','s.id=private.resolve_learner_id_by_code(p_pupil_code)');
  v_def:=pg_get_functiondef('public.teacher_visiting_day_lookup(text)'::regprocedure);
  execute replace(v_def,'upper(trim(s.admission_number))=upper(trim(p_pupil_code))','s.id=private.resolve_learner_id_by_code(p_pupil_code)');
end;
$patch$;
