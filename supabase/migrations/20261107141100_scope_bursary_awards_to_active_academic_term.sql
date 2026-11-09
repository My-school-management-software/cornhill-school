-- A bursary amendment for an existing learner is tied to one active academic term.
create or replace function public.admin_award_bursary_to_existing_learner(
  p_student_id uuid,p_bursary_category text,p_amount_payable_ugx bigint,p_reason text,
  p_sponsor_source text,p_billing_period_label text,p_effective_from date,p_effective_until date,
  p_support_document_path text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $fn$
declare v_id uuid; v_charge_id uuid; v_original_amount bigint; v_charge_count integer; v_term_start date; v_term_end date;
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then raise exception 'Only an authenticated school administrator may approve a bursary' using errcode='42501'; end if;
  if p_student_id is null or not exists(select 1 from public.students where id=p_student_id and status='Active') then raise exception 'Choose an active learner'; end if;
  if p_bursary_category not in ('Full bursary','Half bursary','Partial bursary','Fully sponsored') then raise exception 'Choose a valid bursary category'; end if;
  if nullif(btrim(p_reason),'') is null or length(btrim(p_reason))<5 then raise exception 'Enter a reason of at least five characters'; end if;
  if nullif(btrim(p_billing_period_label),'') is null then raise exception 'Enter the billing period this award covers'; end if;
  if p_effective_from is null or p_effective_until is null or p_effective_until<p_effective_from then raise exception 'A bursary approval must have a start and end date within one academic term'; end if;
  select starts_on,ends_on into v_term_start,v_term_end from public.academic_terms where is_current and not is_closed limit 1;
  if v_term_start is null then raise exception 'Set an active academic term before approving a bursary'; end if;
  if p_effective_from<v_term_start or p_effective_until>v_term_end then
    raise exception 'This bursary approval must be limited to the active term dates (% to %)',v_term_start,v_term_end;
  end if;
  if p_bursary_category in ('Full bursary','Fully sponsored') and coalesce(p_amount_payable_ugx,-1)<>0 then raise exception 'Full bursary and fully sponsored awards must have UGX 0 payable'; end if;
  if p_bursary_category in ('Half bursary','Partial bursary') and coalesce(p_amount_payable_ugx,0)<=0 then raise exception 'Enter a positive amount payable'; end if;
  if p_support_document_path is not null and (left(p_support_document_path,length(auth.uid()::text)+1)<>(auth.uid()::text||'/') or position('..' in p_support_document_path)>0) then raise exception 'Invalid bursary evidence file path'; end if;
  insert into public.learner_bursary_awards(student_id,bursary_category,amount_payable_ugx,reason,sponsor_source,billing_period_label,effective_from,effective_until,support_document_path,approved_by)
  values(p_student_id,p_bursary_category,p_amount_payable_ugx,btrim(p_reason),nullif(btrim(p_sponsor_source),''),btrim(p_billing_period_label),p_effective_from,p_effective_until,p_support_document_path,auth.uid())
  returning id into v_id;
  select count(*) into v_charge_count from public.learner_charges where student_id=p_student_id and description=btrim(p_billing_period_label)||' - School fees';
  if v_charge_count>1 then raise exception 'More than one school-fees charge matches this billing period. Ask the bursar to review the duplicate charges before approving this award.'; end if;
  if v_charge_count=1 then
    select id,amount_ugx into v_charge_id,v_original_amount from public.learner_charges where student_id=p_student_id and description=btrim(p_billing_period_label)||' - School fees' for update;
    update public.learner_charges set amount_ugx=p_amount_payable_ugx where id=v_charge_id;
    update public.learner_bursary_awards set adjusted_charge_id=v_charge_id,original_fee_amount_ugx=v_original_amount,adjusted_fee_amount_ugx=p_amount_payable_ugx where id=v_id;
  elsif p_amount_payable_ugx>0 then
    insert into public.learner_charges(invoice_no,student_id,description,amount_ugx,created_by)
    values('BUR-'||upper(replace(gen_random_uuid()::text,'-','')),p_student_id,btrim(p_billing_period_label)||' - Approved bursary payable ('||p_bursary_category||') - '||btrim(p_reason),p_amount_payable_ugx,auth.uid())
    returning id into v_charge_id;
    update public.learner_bursary_awards set adjusted_charge_id=v_charge_id,adjusted_fee_amount_ugx=p_amount_payable_ugx where id=v_id;
  end if;
  return v_id;
end;
$fn$;

create or replace function public.clear_bursary_review_notification_on_approval()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
  update public.school_notifications n set archived_at=now(),archived_by=new.approved_by,
    archive_reason='Automatically cleared after a new bursary approval for this term'
  where n.student_id=new.student_id and n.category='bursary_review' and n.archived_at is null
    and exists(select 1 from public.academic_terms t where t.is_current and new.effective_from<=t.ends_on and new.effective_until>=t.starts_on);
  return new;
end;
$fn$;
drop trigger if exists clear_bursary_review_after_approval on public.learner_bursary_awards;
create trigger clear_bursary_review_after_approval after insert on public.learner_bursary_awards
for each row execute function public.clear_bursary_review_notification_on_approval();
revoke all on function public.clear_bursary_review_notification_on_approval() from public,anon,authenticated;
