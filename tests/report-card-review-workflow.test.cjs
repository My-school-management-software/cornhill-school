'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '../supabase/migrations/20261111201000_report_card_class_review_workflow.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

function functionBody(name) {
  const escaped = name.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  const match = sql.match(new RegExp('create or replace function public\\.' + escaped + '[\\s\\S]*?\\$function\\$;', 'i'));
  assert.ok(match, 'missing function ' + name);
  return match[0];
}

test('workflow state is stored per class and academic term', () => {
  assert.match(sql, /create table if not exists public\.report_card_review_workflows/i);
  assert.match(sql, /unique\s*\(\s*class_id\s*,\s*term_id\s*\)/i);
});

test('review workflow preserves foreign keys to the school class, term and staff identities', () => {
  const table = sql.split('create table if not exists public.report_card_review_workflows')[1].split(');')[0];
  assert.match(table, /class_id uuid not null references public\.school_classes/i);
  assert.match(table, /term_id uuid not null references public\.academic_terms/i);
  assert.match(table, /submitted_by uuid references public\.user_profiles/i);
  assert.match(table, /dos_reviewed_by uuid references public\.user_profiles/i);
  assert.match(table, /headteacher_reviewed_by uuid references public\.user_profiles/i);
  assert.match(table, /director_approved_by uuid references public\.user_profiles/i);
});

test('workflow states require DOS, Headteacher and Director sequencing', () => {
  const table = sql.split('create table if not exists public.report_card_review_workflows')[1].split(');')[0];
  for (const state of ['draft','submitted_to_dos','returned_for_corrections','dos_approved','headteacher_approved','published']) {
    assert.ok(table.includes("'" + state + "'"), state);
  }
});

test('DOS and Headteacher decisions are constrained to approve or return', () => {
  const table = sql.split('create table if not exists public.report_card_review_workflows')[1].split(');')[0];
  assert.match(table, /dos_decision text check\s*\(dos_decision in \('approve','return'\)\)/i);
  assert.match(table, /headteacher_decision text check\s*\(headteacher_decision in \('approve','return'\)\)/i);
});

test('review event history records actor, stage, status change, notes and metadata', () => {
  const events = sql.split('create table if not exists public.report_card_review_events')[1].split(');')[0];
  for (const field of ['workflow_id','class_id','term_id','actor_id','event_key','from_status','to_status','notes','metadata','created_at']) {
    assert.match(events, new RegExp('\\b' + field + '\\b'));
  }
});

test('workflow and event tables have row-level security enabled', () => {
  assert.match(sql, /alter table public\.report_card_review_workflows enable row level security/i);
  assert.match(sql, /alter table public\.report_card_review_events enable row level security/i);
});

test('only active academic viewers receive SELECT policy access to workflow rows', () => {
  assert.match(sql, /create policy "Academic leaders view report-card workflows"[\s\S]*?for select to authenticated\s+using \(public\.is_school_academic_viewer\(\)\)/i);
});

test('only active academic viewers receive SELECT policy access to review history', () => {
  assert.match(sql, /create policy "Academic leaders view report-card review events"[\s\S]*?for select to authenticated\s+using \(public\.is_school_academic_viewer\(\)\)/i);
});

test('authenticated staff cannot directly insert, update or delete workflow or audit rows', () => {
  assert.match(sql, /revoke all on public\.report_card_review_workflows from anon, authenticated/i);
  assert.match(sql, /revoke all on public\.report_card_review_events from anon, authenticated/i);
  assert.match(sql, /grant select on public\.report_card_review_workflows to authenticated/i);
  assert.match(sql, /grant select on public\.report_card_review_events to authenticated/i);
});

test('class result snapshot runs as a stable security-definer with an empty search path', () => {
  const fn = functionBody('report_card_class_review_snapshot');
  assert.match(fn, /returns text\s+language plpgsql\s+stable\s+security definer\s+set search_path to ''/i);
});

test('snapshot includes assessment structure and the saved learner scores', () => {
  const fn = functionBody('report_card_class_review_snapshot');
  for (const field of ['a.subject_id','a.title','a.assessment_type','a.max_score','a.assessment_date','s.student_id','s.score']) {
    assert.ok(fn.includes(field), field);
  }
});

test('snapshot includes teacher comments and score update timestamps', () => {
  const fn = functionBody('report_card_class_review_snapshot');
  assert.match(fn, /s\.teacher_comment/);
  assert.match(fn, /s\.updated_at/);
});

test('snapshot includes only the active class register and learner identity changes', () => {
  const fn = functionBody('report_card_class_review_snapshot');
  assert.match(fn, /public\.students st/);
  assert.match(fn, /st\.status = 'Active'/);
  assert.match(fn, /st\.admission_number/);
  assert.match(fn, /st\.first_name/);
  assert.match(fn, /st\.last_name/);
});

test('assessment edits are blocked after at least one report is published for the class and term', () => {
  const fn = functionBody('guard_published_report_card_assessments');
  assert.match(fn, /security definer\s+set search_path to ''/i);
  assert.match(fn, /public\.report_card_publications/);
  assert.match(fn, /old\.class_id[\s\S]*?old\.term_id/);
  assert.match(fn, /new\.class_id[\s\S]*?new\.term_id/);
  assert.match(sql, /create trigger guard_published_report_card_assessments\s+before insert or update or delete on public\.assessments/i);
});

test('saved mark and teacher-comment changes are blocked after a learner report is published', () => {
  const fn = functionBody('guard_published_report_card_scores');
  assert.match(fn, /public\.report_card_publications/);
  assert.match(fn, /old\.student_id/);
  assert.match(fn, /new\.student_id/);
  assert.match(fn, /old\.assessment_id/);
  assert.match(fn, /new\.assessment_id/);
  assert.match(sql, /create trigger guard_published_report_card_scores\s+before insert or update or delete on public\.assessment_scores/i);
});

test('class and term advisory locks serialize publication against concurrent assessment edits', () => {
  const assessmentGuard = functionBody('guard_published_report_card_assessments');
  const scoreGuard = functionBody('guard_published_report_card_scores');
  const publish = functionBody('publish_report_card_class');
  const reopen = functionBody('reopen_report_card_class');
  for (const fn of [assessmentGuard,scoreGuard,publish,reopen]) {
    assert.match(fn, /pg_advisory_xact_lock/);
    assert.match(fn, /hashtextextended/);
  }
});

test('only the Director or DOS may submit a class to the workflow', () => {
  const fn = functionBody('submit_report_card_class_for_review');
  assert.match(fn, /not public\.is_school_academic_manager\(\)/);
  assert.match(fn, /Only the Director or active Director of Studies/);
});

test('submission rejects an empty class, missing assessments or no saved marks', () => {
  const fn = functionBody('submit_report_card_class_for_review');
  assert.match(fn, /v_active_learners=0/);
  assert.match(fn, /v_assessments=0/);
  assert.match(fn, /v_saved_marks=0/);
});

test('re-submission is allowed only from draft or returned-for-corrections states', () => {
  const fn = functionBody('submit_report_card_class_for_review');
  assert.match(fn, /status not in \('draft','returned_for_corrections'\)/);
  assert.match(fn, /dos_reviewed_by=null/);
  assert.match(fn, /headteacher_reviewed_by=null/);
  assert.match(fn, /director_approved_by=null/);
});

test('DOS approval is restricted to the active DOS role, not a Director override', () => {
  const fn = functionBody('review_report_card_class_as_dos');
  assert.match(fn, /if not public\.is_school_dos\(\) then/);
  assert.doesNotMatch(fn, /is_school_admin\(\)/);
  assert.match(fn, /status<>'submitted_to_dos'/);
});

test('Headteacher approval is restricted to the active Headteacher role, not a Director override', () => {
  const fn = functionBody('review_report_card_class_as_headteacher');
  assert.match(fn, /if not public\.is_school_headteacher\(\) then/);
  assert.doesNotMatch(fn, /is_school_admin\(\)/);
  assert.match(fn, /status<>'dos_approved'/);
});

test('null and unknown review decisions are rejected', () => {
  const dos = functionBody('review_report_card_class_as_dos');
  const head = functionBody('review_report_card_class_as_headteacher');
  assert.match(dos, /p_decision is null or p_decision not in \('approve','return'\)/);
  assert.match(head, /p_decision is null or p_decision not in \('approve','return'\)/);
});

test('return decisions require an explanation', () => {
  const dos = functionBody('review_report_card_class_as_dos');
  const head = functionBody('review_report_card_class_as_headteacher');
  assert.match(dos, /p_decision='return' and length\(btrim\(coalesce\(p_notes,''\)\)\)<3/);
  assert.match(head, /p_decision='return' and length\(btrim\(coalesce\(p_notes,''\)\)\)<3/);
});

test('Director publication is the only workflow step that creates Guardian Portal publication records', () => {
  const fn = functionBody('publish_report_card_class');
  assert.match(fn, /if not public\.is_school_admin\(\) then/);
  assert.match(fn, /Only the Director may publish report cards to the Parent Portal/);
  assert.match(fn, /v_workflow\.status<>'headteacher_approved'/);
  assert.match(fn, /insert into public\.report_card_publications/);
});

test('publication verifies the original reviewed snapshot before it releases reports', () => {
  const fn = functionBody('publish_report_card_class');
  assert.match(fn, /report_card_class_review_snapshot/);
  assert.match(fn, /v_snapshot is distinct from v_workflow\.snapshot_hash/);
  assert.match(fn, /review_snapshot_changed/);
  assert.match(fn, /needs_resubmission/);
});

test('publication uses the real authenticated Director as approved_by and is idempotent', () => {
  const fn = functionBody('publish_report_card_class');
  assert.match(fn, /approved_by,approved_at/);
  assert.match(fn, /select st\.id,p_class_id,p_term_id,auth\.uid\(\),now\(\)/);
  assert.match(fn, /on conflict \(term_id,student_id\) do nothing/);
});

test('publication refuses incomplete class release rather than accepting a partial cohort', () => {
  const fn = functionBody('publish_report_card_class');
  assert.match(fn, /v_published<>v_active_learners/);
  assert.match(fn, /No partial publication was retained/);
});

test('published report rows stay compatible with the Guardian Portal publication gate', () => {
  const fn = functionBody('publish_report_card_class');
  assert.match(fn, /public\.report_card_publications/);
  assert.match(fn, /student_id,class_id,term_id,approved_by,approved_at/);
});

test('reopening is Director-only and requires a reason', () => {
  const fn = functionBody('reopen_report_card_class');
  assert.match(fn, /if not public\.is_school_admin\(\) then/);
  assert.match(fn, /length\(btrim\(coalesce\(p_reason,''\)\)\)<5/);
});

test('reopening removes Guardian Portal publication rows before corrections are made', () => {
  const fn = functionBody('reopen_report_card_class');
  assert.match(fn, /delete from public\.report_card_publications/);
  assert.match(fn, /set status='returned_for_corrections'/);
  assert.match(fn, /removed_publication_rows/);
});

test('reopening a legacy publication creates a review record without fabricating an approver', () => {
  const fn = functionBody('reopen_report_card_class');
  assert.match(fn, /if not found then[\s\S]*?insert into public\.report_card_review_workflows/);
  assert.match(fn, /'published',\s*public\.report_card_class_review_snapshot/);
  assert.doesNotMatch(fn, /submitted_by[\s\S]{0,80}auth\.uid/);
});

test('all review RPCs are security-definers with an empty search path', () => {
  for (const name of [
    'submit_report_card_class_for_review',
    'review_report_card_class_as_dos',
    'review_report_card_class_as_headteacher',
    'publish_report_card_class',
    'reopen_report_card_class'
  ]) {
    const fn=functionBody(name);
    assert.match(fn,/security definer\s+set search_path to ''/i,name);
  }
});

test('review RPC execution is granted only to authenticated users after public and anonymous revocation', () => {
  for (const name of [
    'submit_report_card_class_for_review(uuid,uuid,text)',
    'review_report_card_class_as_dos(uuid,uuid,text,text)',
    'review_report_card_class_as_headteacher(uuid,uuid,text,text)',
    'publish_report_card_class(uuid,uuid,text)',
    'reopen_report_card_class(uuid,uuid,text)'
  ]) {
    assert.ok(sql.includes('revoke all on function public.'+name+' from public, anon'));
    assert.ok(sql.includes('grant execute on function public.'+name+' to authenticated'));
  }
});

test('workflow events are inserted for submission, both reviews, publication and reopening', () => {
  for (const event of [
    'submitted_to_dos','dos_approved','dos_returned',
    'headteacher_approved','headteacher_returned','director_published','director_reopened'
  ]) assert.ok(sql.includes("'" + event + "'"), event);
});
