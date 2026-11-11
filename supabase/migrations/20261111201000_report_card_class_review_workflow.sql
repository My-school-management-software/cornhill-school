-- CORNHILL report-card review workflow.
-- DOS review -> Headteacher review -> Director publication.
-- Final publication rows remain the single gate used by the Guardian Portal.

create table if not exists public.report_card_review_workflows (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.school_classes(id) on delete cascade,
  term_id uuid not null references public.academic_terms(id) on delete restrict,
  status text not null default 'draft'
    check (status in (
      'draft',
      'submitted_to_dos',
      'returned_for_corrections',
      'dos_approved',
      'headteacher_approved',
      'published'
    )),
  snapshot_hash text,
  submitted_by uuid references public.user_profiles(id),
  submitted_at timestamptz,
  submission_notes text,
  dos_reviewed_by uuid references public.user_profiles(id),
  dos_reviewed_at timestamptz,
  dos_decision text check (dos_decision in ('approve','return')),
  dos_notes text,
  headteacher_reviewed_by uuid references public.user_profiles(id),
  headteacher_reviewed_at timestamptz,
  headteacher_decision text check (headteacher_decision in ('approve','return')),
  headteacher_notes text,
  director_approved_by uuid references public.user_profiles(id),
  director_approved_at timestamptz,
  director_notes text,
  published_learner_count integer not null default 0 check (published_learner_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, term_id)
);

create table if not exists public.report_card_review_events (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.report_card_review_workflows(id) on delete cascade,
  class_id uuid not null references public.school_classes(id) on delete cascade,
  term_id uuid not null references public.academic_terms(id) on delete restrict,
  actor_id uuid not null references public.user_profiles(id),
  event_key text not null,
  from_status text,
  to_status text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists report_card_review_workflows_term_status_idx
  on public.report_card_review_workflows(term_id, status, updated_at desc);
create index if not exists report_card_review_events_workflow_created_idx
  on public.report_card_review_events(workflow_id, created_at desc);

alter table public.report_card_review_workflows enable row level security;
alter table public.report_card_review_events enable row level security;

drop policy if exists "Academic leaders view report-card workflows"
  on public.report_card_review_workflows;
create policy "Academic leaders view report-card workflows"
  on public.report_card_review_workflows
  for select to authenticated
  using (public.is_school_academic_viewer());

drop policy if exists "Academic leaders view report-card review events"
  on public.report_card_review_events;
create policy "Academic leaders view report-card review events"
  on public.report_card_review_events
  for select to authenticated
  using (public.is_school_academic_viewer());

revoke all on public.report_card_review_workflows from anon, authenticated;
revoke all on public.report_card_review_events from anon, authenticated;
grant select on public.report_card_review_workflows to authenticated;
grant select on public.report_card_review_events to authenticated;

-- Snapshot both curriculum/assessment structure and every saved score/comment,
-- plus the active class register. Publication is refused if anything changes
-- after the leadership reviews.
create or replace function public.report_card_class_review_snapshot(
  p_class_id uuid,
  p_term_id uuid
) returns text
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_assessment_hash text;
  v_learner_hash text;
begin
  select md5(coalesce(string_agg(
    concat_ws('|',
      a.id::text,
      a.subject_id::text,
      a.title,
      a.assessment_type,
      a.max_score::text,
      coalesce(a.assessment_date::text,''),
      coalesce(s.student_id::text,''),
      coalesce(s.score::text,''),
      coalesce(s.teacher_comment,''),
      coalesce(s.updated_at::text,'')
    ),
    E'\n' order by a.id, s.student_id
  ), ''))
  into v_assessment_hash
  from public.assessments a
  left join public.assessment_scores s on s.assessment_id = a.id
  where a.class_id = p_class_id
    and a.term_id = p_term_id;

  select md5(coalesce(string_agg(
    concat_ws('|',
      st.id::text,
      st.admission_number,
      st.first_name,
      coalesce(st.middle_name,''),
      st.last_name,
      st.status
    ),
    E'\n' order by st.id
  ), ''))
  into v_learner_hash
  from public.students st
  where st.class_id = p_class_id
    and st.status = 'Active';

  return md5(coalesce(v_assessment_hash,'') || ':' || coalesce(v_learner_hash,''));
end;
$function$;

revoke all on function public.report_card_class_review_snapshot(uuid,uuid)
  from public, anon, authenticated;

-- Prevent scores or assessment structure from changing after any report in
-- that class/term is published. A Director must first reopen the class/term.
create or replace function public.guard_published_report_card_assessments()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op in ('UPDATE','DELETE') and exists (
    select 1
    from public.report_card_publications rp
    where rp.class_id = old.class_id
      and rp.term_id = old.term_id
  ) then
    raise exception 'This class and term already has published report cards. The Director must reopen it before changing assessments.';
  end if;

  if tg_op in ('INSERT','UPDATE') and exists (
    select 1
    from public.report_card_publications rp
    where rp.class_id = new.class_id
      and rp.term_id = new.term_id
  ) then
    raise exception 'This class and term already has published report cards. The Director must reopen it before changing assessments.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

create or replace function public.guard_published_report_card_scores()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_old_term uuid;
  v_new_term uuid;
begin
  if tg_op in ('UPDATE','DELETE') then
    select a.term_id into v_old_term
    from public.assessments a where a.id = old.assessment_id;
    if exists (
      select 1 from public.report_card_publications rp
      where rp.student_id = old.student_id and rp.term_id = v_old_term
    ) then
      raise exception 'This learner already has a published report for the term. The Director must reopen the class before changing marks or comments.';
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    select a.term_id into v_new_term
    from public.assessments a where a.id = new.assessment_id;
    if exists (
      select 1 from public.report_card_publications rp
      where rp.student_id = new.student_id and rp.term_id = v_new_term
    ) then
      raise exception 'This learner already has a published report for the term. The Director must reopen the class before changing marks or comments.';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists guard_published_report_card_assessments
  on public.assessments;
create trigger guard_published_report_card_assessments
  before insert or update or delete on public.assessments
  for each row execute function public.guard_published_report_card_assessments();

drop trigger if exists guard_published_report_card_scores
  on public.assessment_scores;
create trigger guard_published_report_card_scores
  before insert or update or delete on public.assessment_scores
  for each row execute function public.guard_published_report_card_scores();

-- Submit the current class/term result set for DOS review.
create or replace function public.submit_report_card_class_for_review(
  p_class_id uuid,
  p_term_id uuid,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_workflow public.report_card_review_workflows%rowtype;
  v_from_status text;
  v_active_learners integer;
  v_assessments integer;
  v_saved_marks integer;
  v_snapshot text;
begin
  if not public.is_school_academic_manager() then
    raise exception 'Only the Director or active Director of Studies may submit a class for review';
  end if;
  if length(coalesce(p_notes,'')) > 2000 then
    raise exception 'Submission notes cannot exceed 2,000 characters';
  end if;
  if not exists (select 1 from public.school_classes c where c.id=p_class_id)
     or not exists (select 1 from public.academic_terms t where t.id=p_term_id) then
    raise exception 'Choose a valid class and academic term';
  end if;

  select count(*) into v_active_learners
  from public.students st
  where st.class_id=p_class_id and st.status='Active';
  select count(*) into v_assessments
  from public.assessments a
  where a.class_id=p_class_id and a.term_id=p_term_id;
  select count(*) into v_saved_marks
  from public.assessment_scores s
  join public.assessments a on a.id=s.assessment_id
  where a.class_id=p_class_id and a.term_id=p_term_id;

  if v_active_learners=0 then raise exception 'This class has no active learners'; end if;
  if v_assessments=0 then raise exception 'No assessments are recorded for this class and term'; end if;
  if v_saved_marks=0 then raise exception 'No learner marks have been saved for this class and term'; end if;

  v_snapshot := public.report_card_class_review_snapshot(p_class_id,p_term_id);

  select * into v_workflow
  from public.report_card_review_workflows
  where class_id=p_class_id and term_id=p_term_id
  for update;

  if found then
    v_from_status := v_workflow.status;
    if v_workflow.status not in ('draft','returned_for_corrections') then
      raise exception 'This class is already in the report-card review process';
    end if;
    update public.report_card_review_workflows
    set status='submitted_to_dos',
        snapshot_hash=v_snapshot,
        submitted_by=auth.uid(),
        submitted_at=now(),
        submission_notes=nullif(btrim(p_notes),''),
        dos_reviewed_by=null,dos_reviewed_at=null,dos_decision=null,dos_notes=null,
        headteacher_reviewed_by=null,headteacher_reviewed_at=null,
        headteacher_decision=null,headteacher_notes=null,
        director_approved_by=null,director_approved_at=null,director_notes=null,
        published_learner_count=0,updated_at=now()
    where id=v_workflow.id
    returning * into v_workflow;
  else
    v_from_status := null;
    insert into public.report_card_review_workflows(
      class_id,term_id,status,snapshot_hash,submitted_by,submitted_at,submission_notes
    ) values (
      p_class_id,p_term_id,'submitted_to_dos',v_snapshot,auth.uid(),now(),nullif(btrim(p_notes),'')
    ) returning * into v_workflow;
  end if;

  insert into public.report_card_review_events(
    workflow_id,class_id,term_id,actor_id,event_key,from_status,to_status,notes,metadata
  ) values (
    v_workflow.id,p_class_id,p_term_id,auth.uid(),'submitted_to_dos',
    v_from_status,'submitted_to_dos',nullif(btrim(p_notes),''),
    jsonb_build_object('active_learners',v_active_learners,'assessments',v_assessments,'saved_marks',v_saved_marks)
  );

  return jsonb_build_object(
    'ok',true,'workflow_id',v_workflow.id,'status',v_workflow.status,
    'active_learners',v_active_learners,'assessments',v_assessments,'saved_marks',v_saved_marks
  );
end;
$function$;

create or replace function public.review_report_card_class_as_dos(
  p_class_id uuid,
  p_term_id uuid,
  p_decision text,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_workflow public.report_card_review_workflows%rowtype;
  v_to_status text;
begin
  if not public.is_school_dos() and not public.is_school_admin() then
    raise exception 'Only the Director of Studies or Director may complete the DOS review';
  end if;
  if p_decision not in ('approve','return') then
    raise exception 'Choose approve or return';
  end if;
  if length(coalesce(p_notes,''))>2000 then raise exception 'Review notes cannot exceed 2,000 characters'; end if;
  if p_decision='return' and length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'Add a short explanation before returning a class for corrections';
  end if;

  select * into v_workflow
  from public.report_card_review_workflows
  where class_id=p_class_id and term_id=p_term_id
  for update;
  if not found or v_workflow.status<>'submitted_to_dos' then
    raise exception 'This class is not awaiting DOS review';
  end if;

  v_to_status := case when p_decision='approve' then 'dos_approved' else 'returned_for_corrections' end;
  update public.report_card_review_workflows
  set status=v_to_status,dos_reviewed_by=auth.uid(),dos_reviewed_at=now(),
      dos_decision=p_decision,dos_notes=nullif(btrim(p_notes),''),
      updated_at=now()
  where id=v_workflow.id;

  insert into public.report_card_review_events(
    workflow_id,class_id,term_id,actor_id,event_key,from_status,to_status,notes
  ) values (
    v_workflow.id,p_class_id,p_term_id,auth.uid(),
    case when p_decision='approve' then 'dos_approved' else 'dos_returned' end,
    v_workflow.status,v_to_status,nullif(btrim(p_notes),'')
  );
  return jsonb_build_object('ok',true,'status',v_to_status);
end;
$function$;

create or replace function public.review_report_card_class_as_headteacher(
  p_class_id uuid,
  p_term_id uuid,
  p_decision text,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_workflow public.report_card_review_workflows%rowtype;
  v_to_status text;
begin
  if not public.is_school_headteacher() and not public.is_school_admin() then
    raise exception 'Only the Headteacher or Director may complete the Headteacher review';
  end if;
  if p_decision not in ('approve','return') then
    raise exception 'Choose approve or return';
  end if;
  if length(coalesce(p_notes,''))>2000 then raise exception 'Review notes cannot exceed 2,000 characters'; end if;
  if p_decision='return' and length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'Add a short explanation before returning a class for corrections';
  end if;

  select * into v_workflow
  from public.report_card_review_workflows
  where class_id=p_class_id and term_id=p_term_id
  for update;
  if not found or v_workflow.status<>'dos_approved' then
    raise exception 'The DOS must approve this class before Headteacher review';
  end if;

  v_to_status := case when p_decision='approve' then 'headteacher_approved' else 'returned_for_corrections' end;
  update public.report_card_review_workflows
  set status=v_to_status,headteacher_reviewed_by=auth.uid(),
      headteacher_reviewed_at=now(),headteacher_decision=p_decision,
      headteacher_notes=nullif(btrim(p_notes),''),updated_at=now()
  where id=v_workflow.id;

  insert into public.report_card_review_events(
    workflow_id,class_id,term_id,actor_id,event_key,from_status,to_status,notes
  ) values (
    v_workflow.id,p_class_id,p_term_id,auth.uid(),
    case when p_decision='approve' then 'headteacher_approved' else 'headteacher_returned' end,
    v_workflow.status,v_to_status,nullif(btrim(p_notes),'')
  );
  return jsonb_build_object('ok',true,'status',v_to_status);
end;
$function$;

-- Final publication is Director-only. These rows are the Guardian Portal gate.
create or replace function public.publish_report_card_class(
  p_class_id uuid,
  p_term_id uuid,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_workflow public.report_card_review_workflows%rowtype;
  v_snapshot text;
  v_active_learners integer;
  v_inserted integer := 0;
  v_published integer := 0;
begin
  if not public.is_school_admin() then
    raise exception 'Only the Director may publish report cards to the Parent Portal';
  end if;
  if length(coalesce(p_notes,''))>2000 then raise exception 'Publication notes cannot exceed 2,000 characters'; end if;

  select * into v_workflow
  from public.report_card_review_workflows
  where class_id=p_class_id and term_id=p_term_id
  for update;
  if not found or v_workflow.status<>'headteacher_approved' then
    raise exception 'The Headteacher must approve this class before Director publication';
  end if;

  v_snapshot := public.report_card_class_review_snapshot(p_class_id,p_term_id);
  if v_snapshot is distinct from v_workflow.snapshot_hash then
    update public.report_card_review_workflows
    set status='returned_for_corrections',updated_at=now()
    where id=v_workflow.id;
    insert into public.report_card_review_events(
      workflow_id,class_id,term_id,actor_id,event_key,from_status,to_status,notes
    ) values (
      v_workflow.id,p_class_id,p_term_id,auth.uid(),'review_snapshot_changed',
      'headteacher_approved','returned_for_corrections',
      'Marks, assessments or active class records changed after review. Submit again for a fresh DOS and Headteacher review.'
    );
    return jsonb_build_object(
      'ok',false,'needs_resubmission',true,
      'message','The class results changed after review. Submit the class again for fresh DOS and Headteacher approval.'
    );
  end if;

  select count(*) into v_active_learners
  from public.students st
  where st.class_id=p_class_id and st.status='Active';
  if v_active_learners=0 then raise exception 'This class has no active learners to publish'; end if;

  if exists (
    select 1
    from public.students st
    join public.report_card_publications rp
      on rp.student_id=st.id and rp.term_id=p_term_id
    where st.class_id=p_class_id
      and st.status='Active'
      and rp.class_id<>p_class_id
  ) then
    raise exception 'One or more learners already have a report published from another class for this term. The Director must reopen the earlier publication first.';
  end if;

  insert into public.report_card_publications(
    student_id,class_id,term_id,approved_by,approved_at
  )
  select st.id,p_class_id,p_term_id,auth.uid(),now()
  from public.students st
  where st.class_id=p_class_id and st.status='Active'
  on conflict (term_id,student_id) do nothing;
  get diagnostics v_inserted = row_count;

  select count(*) into v_published
  from public.students st
  join public.report_card_publications rp
    on rp.student_id=st.id and rp.term_id=p_term_id and rp.class_id=p_class_id
  where st.class_id=p_class_id and st.status='Active';

  if v_published<>v_active_learners then
    raise exception 'Not all active learners could be published. No partial publication was retained.';
  end if;

  update public.report_card_review_workflows
  set status='published',director_approved_by=auth.uid(),
      director_approved_at=now(),director_notes=nullif(btrim(p_notes),''),
      published_learner_count=v_published,updated_at=now()
  where id=v_workflow.id;

  insert into public.report_card_review_events(
    workflow_id,class_id,term_id,actor_id,event_key,from_status,to_status,notes,metadata
  ) values (
    v_workflow.id,p_class_id,p_term_id,auth.uid(),'director_published',
    'headteacher_approved','published',nullif(btrim(p_notes),''),
    jsonb_build_object('published_learners',v_published,'new_publication_rows',v_inserted)
  );

  return jsonb_build_object(
    'ok',true,'status','published','published_learners',v_published,
    'new_publication_rows',v_inserted
  );
end;
$function$;

-- A published class can only be reopened by the Director with a recorded reason.
-- This removes the Guardian Portal publication gate before marks are corrected.
create or replace function public.reopen_report_card_class(
  p_class_id uuid,
  p_term_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_workflow public.report_card_review_workflows%rowtype;
  v_from_status text;
  v_deleted integer := 0;
begin
  if not public.is_school_admin() then
    raise exception 'Only the Director may reopen a published class report';
  end if;
  if length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>2000 then
    raise exception 'Enter a reason of 5 to 2,000 characters before reopening';
  end if;

  select * into v_workflow
  from public.report_card_review_workflows
  where class_id=p_class_id and term_id=p_term_id
  for update;

  if not found then
    if not exists (
      select 1 from public.report_card_publications rp
      where rp.class_id=p_class_id and rp.term_id=p_term_id
    ) then
      raise exception 'No published reports exist for this class and term';
    end if;
    insert into public.report_card_review_workflows(
      class_id,term_id,status,snapshot_hash,published_learner_count
    ) values (
      p_class_id,p_term_id,'published',
      public.report_card_class_review_snapshot(p_class_id,p_term_id),
      (select count(*) from public.report_card_publications rp
       where rp.class_id=p_class_id and rp.term_id=p_term_id)
    ) returning * into v_workflow;
  end if;

  v_from_status := v_workflow.status;
  delete from public.report_card_publications rp
  where rp.class_id=p_class_id and rp.term_id=p_term_id;
  get diagnostics v_deleted = row_count;

  update public.report_card_review_workflows
  set status='returned_for_corrections',
      snapshot_hash=null,
      dos_reviewed_by=null,dos_reviewed_at=null,dos_decision=null,dos_notes=null,
      headteacher_reviewed_by=null,headteacher_reviewed_at=null,
      headteacher_decision=null,headteacher_notes=null,
      director_approved_by=null,director_approved_at=null,director_notes=null,
      published_learner_count=0,updated_at=now()
  where id=v_workflow.id;

  insert into public.report_card_review_events(
    workflow_id,class_id,term_id,actor_id,event_key,from_status,to_status,notes,metadata
  ) values (
    v_workflow.id,p_class_id,p_term_id,auth.uid(),'director_reopened',
    v_from_status,'returned_for_corrections',btrim(p_reason),
    jsonb_build_object('removed_publication_rows',v_deleted)
  );

  return jsonb_build_object(
    'ok',true,'status','returned_for_corrections','removed_publications',v_deleted,
    'message','Parent Portal access to these reports is paused until corrected reports complete review and are republished.'
  );
end;
$function$;

revoke all on function public.guard_published_report_card_assessments() from public, anon, authenticated;
revoke all on function public.guard_published_report_card_scores() from public, anon, authenticated;
revoke all on function public.submit_report_card_class_for_review(uuid,uuid,text) from public, anon;
revoke all on function public.review_report_card_class_as_dos(uuid,uuid,text,text) from public, anon;
revoke all on function public.review_report_card_class_as_headteacher(uuid,uuid,text,text) from public, anon;
revoke all on function public.publish_report_card_class(uuid,uuid,text) from public, anon;
revoke all on function public.reopen_report_card_class(uuid,uuid,text) from public, anon;

grant execute on function public.submit_report_card_class_for_review(uuid,uuid,text) to authenticated;
grant execute on function public.review_report_card_class_as_dos(uuid,uuid,text,text) to authenticated;
grant execute on function public.review_report_card_class_as_headteacher(uuid,uuid,text,text) to authenticated;
grant execute on function public.publish_report_card_class(uuid,uuid,text) to authenticated;
grant execute on function public.reopen_report_card_class(uuid,uuid,text) to authenticated;

comment on table public.report_card_review_workflows is
  'Class-and-term report-card review chain: DOS, Headteacher, then Director publication. The Guardian Portal remains gated by report_card_publications.';
comment on table public.report_card_review_events is
  'Append-only history of report-card submission, review decisions, publication and reopening.';
