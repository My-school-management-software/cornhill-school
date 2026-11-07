-- Enforce active-term naming and keep unresolved bursary learner badges until a new approval is recorded.
alter table public.school_notifications add column if not exists resolved_at timestamptz;

create or replace function public.list_school_bursary_review_ids()
returns table(student_id uuid)
language plpgsql security definer set search_path = ''
as $fn$
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
    raise exception 'Only a signed-in school administrator may view bursary review flags' using errcode='42501';
  end if;
  return query select distinct n.student_id from public.school_notifications n
    where n.category='bursary_review' and n.student_id is not null and n.resolved_at is null;
end;
$fn$;
revoke all on function public.list_school_bursary_review_ids() from public,anon;
grant execute on function public.list_school_bursary_review_ids() to authenticated;

create or replace function public.admin_set_current_academic_term(p_term_id uuid)
returns void language plpgsql security definer set search_path = ''
as $fn$
declare v_year_id uuid; v_start date; v_end date; v_closed boolean; v_previous_term_id uuid; v_term_label text;
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then raise exception 'Only a signed-in school administrator can change the active term' using errcode='42501'; end if;
  select id into v_previous_term_id from public.academic_terms where is_current for update;
  select t.academic_year_id,t.starts_on,t.ends_on,t.is_closed,t.name||' '||coalesce(y.name,'')
    into v_year_id,v_start,v_end,v_closed,v_term_label from public.academic_terms t
    left join public.academic_years y on y.id=t.academic_year_id where t.id=p_term_id for update of t;
  if not found then raise exception 'Selected term was not found'; end if;
  if v_closed then raise exception 'This term is closed. A closed term cannot be activated'; end if;
  if v_end<current_date then raise exception 'This term end date has passed. Extend the term dates first, or close the term'; end if;
  update public.academic_years set is_current=false where is_current;
  update public.academic_years set is_current=true where id=v_year_id;
  update public.academic_terms set is_current=false where is_current;
  update public.academic_terms set is_current=true where id=p_term_id;
  if v_previous_term_id is not null and v_previous_term_id<>p_term_id then
    insert into public.school_notifications(category,severity,title,message,student_id,audience_role,action_workspace,source_key)
    select 'bursary_review','urgent','Bursary review required for new term',
      'Review this learner’s bursary approval for '||v_term_label||'. Confirm the amount payable and record a new term-specific approval before treating the previous award as renewed.',
      s.id,'Admin','finance','bursary-review:'||s.id::text||':'||p_term_id::text
    from public.students s where s.status='Active'
      and (coalesce(s.is_bursary,false) or exists(select 1 from public.learner_bursary_awards a where a.student_id=s.id))
      and not exists(select 1 from public.learner_bursary_awards a where a.student_id=s.id
        and a.effective_from<=v_end and coalesce(a.effective_until,'infinity'::date)>=v_start
        and lower(btrim(a.billing_period_label))=lower(btrim(v_term_label)))
    on conflict (source_key) do nothing;
  end if;
end;
$fn$;

create or replace function public.admin_award_bursary_to_existing_learner(
  p_student_id uuid,p_bursary_category text,p_amount_payable_ugx bigint,p_reason text,
  p_sponsor_source text,p_billing_period_label text,p_effective_from date,p_effective_until date,
  p_support_document_path text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $fn$
declare v_id uuid; v_charge_id uuid; v_original_amount bigint; v_charge_count integer; v_term_start date; v_term_end date; v_term_label text;
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then raise exception 'Only an authenticated school administrator may approve a bursary' using errcode='42501'; end if;
  if p_student_id is null or not exists(select 1 from public.students where id=p_student_id and status='Active') then raise exception 'Choose an active learner'; end if;
  if p_bursary_category not in ('Full bursary','Half bursary','Partial bursary','Fully sponsored') then raise exception 'Choose a valid bursary category'; end if;
  if nullif(btrim(p_reason),'') is null or length(btrim(p_reason))<5 then raise exception 'Enter a reason of at least five characters'; end if;
  if nullif(btrim(p_billing_period_label),'') is null then raise exception 'Enter the billing period this award covers'; end if;
  if p_effective_from is null or p_effective_until is null or p_effective_until<p_effective_from then raise exception 'A bursary approval must have a start and end date within one academic term'; end if;
  select t.starts_on,t.ends_on,t.name||' '||coalesce(y.name,'') into v_term_start,v_term_end,v_term_label
    from public.academic_terms t left join public.academic_years y on y.id=t.academic_year_id
    where t.is_current and not t.is_closed limit 1;
  if v_term_start is null then raise exception 'Set an active academic term before approving a bursary'; end if;
  if p_effective_from<v_term_start or p_effective_until>v_term_end then raise exception 'This bursary approval must be limited to the active term dates (% to %)',v_term_start,v_term_end; end if;
  if lower(btrim(p_billing_period_label))<>lower(btrim(v_term_label)) then raise exception 'The billing period must match the active term: %',v_term_label; end if;
  if p_bursary_category in ('Full bursary','Fully sponsored') and coalesce(p_amount_payable_ugx,-1)<>0 then raise exception 'Full bursary and fully sponsored awards must have UGX 0 payable'; end if;
  if p_bursary_category in ('Half bursary','Partial bursary') and coalesce(p_amount_payable_ugx,0)<=0 then raise exception 'Enter a positive amount payable'; end if;
  if p_support_document_path is not null and (left(p_support_document_path,length(auth.uid()::text)+1)<>(auth.uid()::text||'/') or position('..' in p_support_document_path)>0) then raise exception 'Invalid bursary evidence file path'; end if;
  insert into public.learner_bursary_awards(student_id,bursary_category,amount_payable_ugx,reason,sponsor_source,billing_period_label,effective_from,effective_until,support_document_path,approved_by)
  values(p_student_id,p_bursary_category,p_amount_payable_ugx,btrim(p_reason),nullif(btrim(p_sponsor_source),''),btrim(p_billing_period_label),p_effective_from,p_effective_until,p_support_document_path,auth.uid()) returning id into v_id;
  select count(*) into v_charge_count from public.learner_charges where student_id=p_student_id and description=btrim(p_billing_period_label)||' - School fees';
  if v_charge_count>1 then raise exception 'More than one school-fees charge matches this billing period. Ask the bursar to review the duplicate charges before approving this award.'; end if;
  if v_charge_count=1 then
    select id,amount_ugx into v_charge_id,v_original_amount from public.learner_charges where student_id=p_student_id and description=btrim(p_billing_period_label)||' - School fees' for update;
    update public.learner_charges set amount_ugx=p_amount_payable_ugx where id=v_charge_id;
    update public.learner_bursary_awards set adjusted_charge_id=v_charge_id,original_fee_amount_ugx=v_original_amount,adjusted_fee_amount_ugx=p_amount_payable_ugx where id=v_id;
  elsif p_amount_payable_ugx>0 then
    insert into public.learner_charges(invoice_no,student_id,description,amount_ugx,created_by)
    values('BUR-'||upper(replace(gen_random_uuid()::text,'-','')),p_student_id,btrim(p_billing_period_label)||' - Approved bursary payable ('||p_bursary_category||') - '||btrim(p_reason),p_amount_payable_ugx,auth.uid()) returning id into v_charge_id;
    update public.learner_bursary_awards set adjusted_charge_id=v_charge_id,adjusted_fee_amount_ugx=p_amount_payable_ugx where id=v_id;
  end if;
  return v_id;
end;
$fn$;

create or replace function public.clear_bursary_review_notification_on_approval()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
  update public.school_notifications n set archived_at=coalesce(n.archived_at,now()),resolved_at=now(),
    archived_by=coalesce(n.archived_by,new.approved_by),archive_reason='Resolved after a new bursary approval for this academic term'
  where n.student_id=new.student_id and n.category='bursary_review' and n.resolved_at is null
    and exists(select 1 from public.academic_terms t left join public.academic_years y on y.id=t.academic_year_id
      where t.is_current and new.effective_from<=t.ends_on and new.effective_until>=t.starts_on
      and lower(btrim(new.billing_period_label))=lower(btrim(t.name||' '||coalesce(y.name,''))));
  return new;
end;
$fn$;
