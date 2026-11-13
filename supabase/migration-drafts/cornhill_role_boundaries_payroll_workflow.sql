-- CORNHILL role boundaries and staged payroll approval.
-- DRAFT ONLY: this file is intentionally stored outside supabase/migrations.
-- Generate a timestamped migration with `supabase migration new cornhill_role_boundaries_payroll_workflow`, copy this file into that generated path, review it, then test against a disposable database before applying.
-- This file must NOT be applied to the production project directly.

begin;

-- ---------------------------------------------------------------------------
-- 1) Explicit role predicates. Finance oversight deliberately continues to
--    include the Director; payment posting does not.
-- ---------------------------------------------------------------------------

create or replace function public.is_school_bursar_operator()
returns boolean
language sql
stable
set search_path = ''
as $function$
  select public.is_active_staff_session()
    and exists (
      select 1
      from public.user_profiles p
      where p.id = (select auth.uid())
        and p.role = 'Staff'
        and p.employment_status = 'Active'
        and lower(regexp_replace(btrim(coalesce(p.job_title, '')), '\s+', ' ', 'g')) in (
          'bursar', 'school bursar', 'main bursar', 'bursar (main)', 'bursar main',
          'deputy bursar', 'deputy school bursar', 'deputy bursar (school)'
        )
    );
$function$;

revoke all on function public.is_school_bursar_operator() from public, anon;
grant execute on function public.is_school_bursar_operator() to authenticated, service_role;

create or replace function public.is_school_inventory_manager()
returns boolean
language sql
stable
set search_path = ''
as $function$
  select public.is_school_admin()
    or (
      public.is_active_staff_session()
      and exists (
        select 1
        from public.user_profiles p
        where p.id = (select auth.uid())
          and p.role = 'Staff'
          and p.employment_status = 'Active'
          and lower(regexp_replace(btrim(coalesce(p.job_title, '')), '\s+', ' ', 'g')) in (
            'store manager', 'stores manager', 'main store manager',
            'store manager (main)', 'deputy store manager',
            'storekeeper', 'store officer', 'inventory manager'
          )
      )
    );
$function$;

revoke all on function public.is_school_inventory_manager() from public, anon;
grant execute on function public.is_school_inventory_manager() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Learner payments: both RPCs used by the application are Bursar-only.
--    The existing payment-allocation logic is retained exactly.
-- ---------------------------------------------------------------------------

create or replace function public.post_school_payment(
  p_student_id uuid,
  p_amount_ugx bigint,
  p_payment_method text,
  p_payment_reference text default null::text,
  p_notes text default null::text
)
returns table (
  payment_id uuid,
  receipt_no text,
  unallocated_amount_ugx bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_payment_id uuid := gen_random_uuid();
  v_receipt text;
  v_remaining bigint := p_amount_ugx;
  v_charge record;
  v_due bigint;
  v_paid bigint;
begin
  if v_uid is null or not coalesce(public.is_school_bursar_operator(), false) then
    raise exception 'Only the Main or Deputy Bursar may post learner payments'
      using errcode = '42501';
  end if;

  if p_student_id is null or p_amount_ugx is null or p_amount_ugx <= 0 then
    raise exception 'Select a learner and enter a payment amount greater than zero';
  end if;
  if p_payment_method is null or p_payment_method not in ('Cash', 'Mobile Money', 'Bank Transfer', 'Card', 'Other') then
    raise exception 'Invalid payment method';
  end if;
  if not exists (select 1 from public.students s where s.id = p_student_id) then
    raise exception 'Learner was not found';
  end if;

  v_receipt := 'CHR-' || to_char(timezone('Africa/Kampala', now()), 'YYYY')
    || '-' || lpad(nextval('public.school_receipt_seq')::text, 6, '0');

  insert into public.school_payments (
    id, receipt_no, student_id, amount_ugx, unallocated_amount_ugx,
    payment_method, payment_reference, notes, received_by
  ) values (
    v_payment_id, v_receipt, p_student_id, p_amount_ugx, p_amount_ugx,
    p_payment_method, nullif(trim(p_payment_reference), ''),
    nullif(trim(p_notes), ''), v_uid
  );

  for v_charge in
    select c.id, c.amount_ugx
    from public.learner_charges c
    where c.student_id = p_student_id
    order by c.created_at, c.id
    for update
  loop
    exit when v_remaining <= 0;
    select coalesce(sum(a.amount_ugx), 0) into v_paid
    from public.payment_allocations a
    join public.school_payments p on p.id = a.payment_id
    where a.charge_id = v_charge.id and p.status = 'Posted';
    v_due := v_charge.amount_ugx - v_paid;
    if v_due > 0 then
      insert into public.payment_allocations(payment_id, charge_id, amount_ugx)
      values(v_payment_id, v_charge.id, least(v_due, v_remaining));
      v_remaining := v_remaining - least(v_due, v_remaining);
    end if;
  end loop;

  update public.school_payments
  set unallocated_amount_ugx = v_remaining
  where id = v_payment_id;

  return query select v_payment_id, v_receipt, v_remaining;
end;
$function$;

revoke all on function public.post_school_payment(uuid, bigint, text, text, text)
  from public, anon;
grant execute on function public.post_school_payment(uuid, bigint, text, text, text)
  to authenticated, service_role;

create or replace function public.post_school_payment_complete(
  p_student_id uuid,
  p_amount_ugx bigint,
  p_payment_method text,
  p_payment_reference text default null::text,
  p_notes text default null::text,
  p_allocations jsonb default null::jsonb,
  p_collection_item text default 'School fees'::text,
  p_payer_name text default null::text
)
returns table(payment_id uuid, receipt_no text, unallocated_amount_ugx bigint)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_payment_id uuid := gen_random_uuid();
  v_receipt text;
  v_remaining bigint := p_amount_ugx;
  v_item jsonb;
  v_charge_id uuid;
  v_amount bigint;
  v_due bigint;
  v_paid bigint;
  v_sum bigint := 0;
  v_seen_charge_ids uuid[] := '{}'::uuid[];
  v_enrolment_period_id uuid;
  v_current_term_id uuid;
begin
  if v_uid is null or not coalesce(public.is_school_bursar_operator(), false) then
    raise exception 'Only the Main or Deputy Bursar may post learner payments'
      using errcode = '42501';
  end if;
  if p_student_id is null or p_amount_ugx is null or p_amount_ugx <= 0 then
    raise exception 'Select a learner and enter a payment amount greater than zero';
  end if;
  if p_payment_method is null or p_payment_method not in ('Cash','Mobile Money','Bank Transfer','Card','Other') then
    raise exception 'Invalid payment method';
  end if;
  if nullif(btrim(p_collection_item), '') is null then
    raise exception 'Enter the payment reason before posting the payment';
  end if;
  if p_allocations is not null and jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Payment allocations must be a list';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));
  select ep.id into v_enrolment_period_id
  from public.learner_enrolment_periods ep
  where ep.student_id = p_student_id and ep.status = 'Active'
  order by ep.admission_date desc, ep.created_at desc
  limit 1 for update;
  if v_enrolment_period_id is null then
    raise exception 'This learner has no active enrolment. Re-admit the learner before posting a new payment';
  end if;

  select t.id into v_current_term_id
  from public.academic_terms t
  where t.is_current = true and t.is_closed = false
  order by t.starts_on desc
  limit 1;

  if p_allocations is not null then
    for v_item in select value from jsonb_array_elements(p_allocations) loop
      if coalesce(v_item->>'charge_id','') = '' or coalesce(v_item->>'amount_ugx','') = '' then
        raise exception 'Each allocation needs a fee charge and amount';
      end if;
      v_charge_id := (v_item->>'charge_id')::uuid;
      v_amount := (v_item->>'amount_ugx')::bigint;
      if v_amount is null or v_amount <= 0 then
        raise exception 'Each allocation must be greater than zero';
      end if;
      if v_charge_id = any(v_seen_charge_ids) then
        raise exception 'A fee charge can only appear once in a payment allocation';
      end if;
      v_seen_charge_ids := array_append(v_seen_charge_ids, v_charge_id);
      select c.amount_ugx into v_due
      from public.learner_charges c
      where c.id = v_charge_id and c.student_id = p_student_id
        and c.enrolment_period_id = v_enrolment_period_id
      for update;
      if not found then
        raise exception 'A selected fee charge does not belong to this active enrolment';
      end if;
      select coalesce(sum(a.amount_ugx), 0) into v_paid
      from public.payment_allocations a
      join public.school_payments p on p.id = a.payment_id
      where a.charge_id = v_charge_id and p.status = 'Posted';
      if v_amount > v_due - v_paid then
        raise exception 'An allocation exceeds the remaining balance on a selected fee charge';
      end if;
      v_sum := v_sum + v_amount;
    end loop;
    if v_sum > p_amount_ugx then
      raise exception 'Allocated amounts cannot exceed the payment received';
    end if;
  end if;

  v_receipt := 'CHR-' || to_char(timezone('Africa/Kampala', now()), 'YYYY')
    || '-' || lpad(nextval('public.school_receipt_seq')::text, 6, '0');
  insert into public.school_payments(
    id, receipt_no, student_id, enrolment_period_id, amount_ugx,
    unallocated_amount_ugx, payment_method, payment_reference, notes,
    received_by, collection_item, payer_name
  ) values (
    v_payment_id, v_receipt, p_student_id, v_enrolment_period_id, p_amount_ugx,
    p_amount_ugx, p_payment_method, nullif(trim(p_payment_reference), ''),
    nullif(trim(p_notes), ''), v_uid, btrim(p_collection_item),
    nullif(btrim(p_payer_name), '')
  );

  if p_allocations is not null then
    for v_item in select value from jsonb_array_elements(p_allocations) loop
      insert into public.payment_allocations(payment_id, charge_id, amount_ugx)
      values(v_payment_id, (v_item->>'charge_id')::uuid, (v_item->>'amount_ugx')::bigint);
    end loop;
    v_remaining := p_amount_ugx - v_sum;
  end if;

  -- Previous-term charges are paid only when selected explicitly.
  for v_charge_id, v_due in
    select c.id, c.amount_ugx
    from public.learner_charges c
    left join public.fee_items fi on fi.id = c.fee_item_id
    where c.student_id = p_student_id
      and c.enrolment_period_id = v_enrolment_period_id
      and v_current_term_id is not null
      and c.term_id = v_current_term_id
    order by case
      when position(lower(btrim(p_collection_item)) in lower(coalesce(fi.name,'') || ' ' || c.description)) > 0
      then 0 else 1 end, c.created_at, c.id
    for update of c
  loop
    exit when v_remaining <= 0;
    select coalesce(sum(a.amount_ugx), 0) into v_paid
    from public.payment_allocations a
    join public.school_payments p on p.id = a.payment_id
    where a.charge_id = v_charge_id and p.status = 'Posted';
    v_due := v_due - v_paid;
    if v_due > 0 then
      insert into public.payment_allocations(payment_id, charge_id, amount_ugx)
      values(v_payment_id, v_charge_id, least(v_due, v_remaining));
      v_remaining := v_remaining - least(v_due, v_remaining);
    end if;
  end loop;

  update public.school_payments
  set unallocated_amount_ugx = v_remaining
  where id = v_payment_id;
  return query select v_payment_id, v_receipt, v_remaining;
end;
$function$;

revoke all on function public.post_school_payment_complete(uuid, bigint, text, text, text, jsonb, text, text)
  from public, anon;
grant execute on function public.post_school_payment_complete(uuid, bigint, text, text, text, jsonb, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Inventory: remove the broad finance-operator write policies. The Director
--    and designated active Store Manager job titles keep access.
-- ---------------------------------------------------------------------------

drop policy if exists "Finance operators manage inventory categories" on public.inventory_categories;
drop policy if exists "Finance operators manage inventory items" on public.inventory_items;
drop policy if exists "Finance operators manage inventory movements" on public.inventory_movements;

create policy "Inventory managers manage categories"
on public.inventory_categories for all to authenticated
using (public.is_school_inventory_manager())
with check (public.is_school_inventory_manager());

create policy "Inventory managers manage items"
on public.inventory_items for all to authenticated
using (public.is_school_inventory_manager())
with check (public.is_school_inventory_manager());

create policy "Inventory managers record movements"
on public.inventory_movements for all to authenticated
using (public.is_school_inventory_manager())
with check (public.is_school_inventory_manager());

-- ---------------------------------------------------------------------------
-- 4) Payroll preparation / independent approval / payment-recording workflow.
-- ---------------------------------------------------------------------------

alter table public.payroll_periods
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists returned_by uuid references auth.users(id) on delete set null,
  add column if not exists returned_at timestamptz,
  add column if not exists return_reason text;

alter table public.payroll_items
  add column if not exists approved_net_pay_ugx bigint,
  add column if not exists payment_recorded_by uuid references auth.users(id) on delete set null,
  add column if not exists payment_recorded_at timestamptz;

alter table public.payroll_items
  drop constraint if exists payroll_items_approved_net_pay_ugx_check;
alter table public.payroll_items
  add constraint payroll_items_approved_net_pay_ugx_check
  check (approved_net_pay_ugx is null or approved_net_pay_ugx >= 0);

alter table public.payroll_periods
  drop constraint if exists payroll_periods_status_check;
alter table public.payroll_periods
  add constraint payroll_periods_status_check
  check (status = any (array['Draft','Submitted','Returned','Approved','Part-paid','Paid','Cancelled']));

-- Net pay is calculated by the database after attendance deductions have run.
create or replace function public.set_payroll_item_net_pay()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.net_pay_ugx := new.base_salary_ugx + new.allowances_ugx
    - new.deductions_ugx - new.advance_recovery_ugx;
  if new.net_pay_ugx < 0 then
    raise exception 'Payroll net pay cannot be negative';
  end if;
  return new;
end;
$function$;

revoke all on function public.set_payroll_item_net_pay() from public, anon, authenticated;
drop trigger if exists trg_set_payroll_item_net_pay on public.payroll_items;
create trigger trg_set_payroll_item_net_pay
before insert or update of base_salary_ugx, allowances_ugx, deductions_ugx, advance_recovery_ugx
on public.payroll_items
for each row execute function public.set_payroll_item_net_pay();

-- Read permissions: finance staff need the payroll totals to prepare/review;
-- staff retain the existing self-only payslip policies.
drop policy if exists "Finance operators read payroll periods" on public.payroll_periods;
create policy "Finance operators read payroll periods"
on public.payroll_periods for select to authenticated
using (public.is_school_finance_operator());

drop policy if exists "Finance operators read payroll items" on public.payroll_items;
create policy "Finance operators read payroll items"
on public.payroll_items for select to authenticated
using (public.is_school_finance_operator());

drop policy if exists "Finance operators read salary agreements" on public.staff_salary_agreements;
create policy "Finance operators read salary agreements"
on public.staff_salary_agreements for select to authenticated
using (public.is_school_finance_operator());

drop policy if exists "Finance operators read salary advances" on public.staff_salary_advances;
create policy "Finance operators read salary advances"
on public.staff_salary_advances for select to authenticated
using (public.is_school_finance_operator());

-- Only Draft/Returned periods can be edited directly. Submission, approval,
-- return and payment-state transitions are reserved to the RPCs below.
drop policy if exists "School administrators insert payroll_periods" on public.payroll_periods;
create policy "Finance operators create draft payroll periods"
on public.payroll_periods for insert to authenticated
with check (
  (public.is_school_admin() or public.is_school_bursar_operator())
  and created_by = (select auth.uid())
  and status = 'Draft'
);

drop policy if exists "School administrators update payroll_periods" on public.payroll_periods;
create policy "Finance operators update draft payroll periods"
on public.payroll_periods for update to authenticated
using (
  status in ('Draft','Returned')
  and (
    public.is_school_admin()
    or (public.is_school_bursar_operator() and created_by = (select auth.uid()))
  )
)
with check (
  status in ('Draft','Returned')
  and (
    public.is_school_admin()
    or (public.is_school_bursar_operator() and created_by = (select auth.uid()))
  )
);

drop policy if exists "School administrators delete payroll_periods" on public.payroll_periods;
create policy "Administrators delete unsubmitted payroll periods"
on public.payroll_periods for delete to authenticated
using (public.is_school_admin() and status in ('Draft','Returned'));

drop policy if exists "Bursars insert draft payroll items" on public.payroll_items;
create policy "Bursars insert draft payroll items"
on public.payroll_items for insert to authenticated
with check (
  public.is_school_bursar_operator()
  and exists (
    select 1 from public.payroll_periods pp
    where pp.id = payroll_items.payroll_period_id
      and pp.created_by = (select auth.uid())
      and pp.status in ('Draft','Returned')
  )
);

drop policy if exists "School administrators update payroll_items" on public.payroll_items;
create policy "Finance operators update draft payroll items"
on public.payroll_items for update to authenticated
using (
  exists (
    select 1 from public.payroll_periods pp
    where pp.id = payroll_items.payroll_period_id
      and pp.status in ('Draft','Returned')
      and (
        public.is_school_admin()
        or (public.is_school_bursar_operator() and pp.created_by = (select auth.uid()))
      )
  )
)
with check (
  exists (
    select 1 from public.payroll_periods pp
    where pp.id = payroll_items.payroll_period_id
      and pp.status in ('Draft','Returned')
      and (
        public.is_school_admin()
        or (public.is_school_bursar_operator() and pp.created_by = (select auth.uid()))
      )
  )
);

drop policy if exists "School administrators delete payroll_items" on public.payroll_items;
create policy "Administrators delete draft payroll items"
on public.payroll_items for delete to authenticated
using (
  public.is_school_admin()
  and exists (
    select 1 from public.payroll_periods pp
    where pp.id = payroll_items.payroll_period_id
      and pp.status in ('Draft','Returned')
  )
);

-- Bursar: submit a complete draft for review. This function never approves it.
create or replace function public.submit_school_payroll(p_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_period public.payroll_periods%rowtype;
  v_count integer;
begin
  if auth.uid() is null or not coalesce(public.is_school_bursar_operator(), false) then
    raise exception 'Only the Main or Deputy Bursar may submit payroll'
      using errcode = '42501';
  end if;

  select * into v_period
  from public.payroll_periods
  where id = p_period_id
  for update;

  if not found or v_period.created_by <> auth.uid()
     or v_period.status not in ('Draft','Returned') then
    raise exception 'This payroll is not an editable draft owned by this Bursar';
  end if;

  select count(*) into v_count
  from public.payroll_items
  where payroll_period_id = p_period_id
    and status = 'Pending'
    and net_pay_ugx is not null;

  if v_count = 0 then
    raise exception 'Add at least one complete payroll line before submitting';
  end if;

  if exists (
    select 1 from public.payroll_items
    where payroll_period_id = p_period_id
      and (status <> 'Pending' or net_pay_ugx is null
        or net_pay_ugx <> base_salary_ugx + allowances_ugx - deductions_ugx - advance_recovery_ugx)
  ) then
    raise exception 'Review every payroll line; a line is incomplete or its net amount is inconsistent';
  end if;

  update public.payroll_periods
  set status = 'Submitted',
      submitted_by = auth.uid(),
      submitted_at = now(),
      returned_by = null,
      returned_at = null,
      return_reason = null
  where id = p_period_id;

  return jsonb_build_object('success', true, 'status', 'Submitted', 'line_count', v_count);
end;
$function$;

revoke all on function public.submit_school_payroll(uuid) from public, anon;
grant execute on function public.submit_school_payroll(uuid) to authenticated, service_role;

-- Director: independently approve only a submitted payroll prepared by a
-- different account. The per-line approved amount becomes the immutable snapshot.
create or replace function public.approve_school_payroll(p_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_period public.payroll_periods%rowtype;
  v_count integer;
  v_total bigint;
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(), false) then
    raise exception 'Only the Director may approve payroll'
      using errcode = '42501';
  end if;

  select * into v_period
  from public.payroll_periods
  where id = p_period_id
  for update;

  if not found or v_period.status <> 'Submitted' then
    raise exception 'Only a submitted payroll may be approved';
  end if;
  if v_period.created_by = auth.uid() then
    raise exception 'The person who prepared this payroll cannot approve it';
  end if;

  perform 1 from public.payroll_items
  where payroll_period_id = p_period_id
  order by id
  for update;

  select count(*), coalesce(sum(net_pay_ugx), 0)::bigint
  into v_count, v_total
  from public.payroll_items
  where payroll_period_id = p_period_id
    and status = 'Pending'
    and net_pay_ugx is not null
    and net_pay_ugx = base_salary_ugx + allowances_ugx - deductions_ugx - advance_recovery_ugx;

  if v_count = 0 or exists (
    select 1 from public.payroll_items
    where payroll_period_id = p_period_id
      and (status <> 'Pending' or net_pay_ugx is null
        or net_pay_ugx <> base_salary_ugx + allowances_ugx - deductions_ugx - advance_recovery_ugx)
  ) then
    raise exception 'Payroll lines failed the approval integrity check';
  end if;

  update public.payroll_items
  set approved_net_pay_ugx = net_pay_ugx
  where payroll_period_id = p_period_id;

  update public.payroll_periods
  set status = 'Approved', approved_by = auth.uid(), approved_at = now()
  where id = p_period_id;

  return jsonb_build_object('success', true, 'status', 'Approved',
    'line_count', v_count, 'approved_total_ugx', v_total);
end;
$function$;

revoke all on function public.approve_school_payroll(uuid) from public, anon;
grant execute on function public.approve_school_payroll(uuid) to authenticated, service_role;

-- Director: return a submitted draft with a recorded reason; the Bursar may
-- correct it and submit it again. A returned draft is not payable.
create or replace function public.return_school_payroll(p_period_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_period public.payroll_periods%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(), false) then
    raise exception 'Only the Director may return payroll'
      using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) < 5 or length(v_reason) > 500 then
    raise exception 'Enter a return reason between 5 and 500 characters';
  end if;

  select * into v_period
  from public.payroll_periods
  where id = p_period_id
  for update;

  if not found or v_period.status <> 'Submitted' then
    raise exception 'Only a submitted payroll may be returned';
  end if;

  update public.payroll_periods
  set status = 'Returned', returned_by = auth.uid(),
      returned_at = now(), return_reason = v_reason
  where id = p_period_id;

  return jsonb_build_object('success', true, 'status', 'Returned', 'reason', v_reason);
end;
$function$;

revoke all on function public.return_school_payroll(uuid, text) from public, anon;
grant execute on function public.return_school_payroll(uuid, text) to authenticated, service_role;

-- Bursar: record the actual disbursement only. This RPC cannot change the
-- approved salary, allowance, deduction, advance-recovery or net-pay amounts.
-- Existing payroll triggers still create the salary expense, settle advance
-- recovery and notify the staff member after the status becomes Paid.
create or replace function public.record_school_payroll_item_payment(
  p_payroll_item_id uuid,
  p_payment_method text,
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item public.payroll_items%rowtype;
  v_period public.payroll_periods%rowtype;
  v_method text := btrim(coalesce(p_payment_method, ''));
  v_reference text := nullif(btrim(p_payment_reference), '');
begin
  if auth.uid() is null or not coalesce(public.is_school_bursar_operator(), false) then
    raise exception 'Only the Main or Deputy Bursar may record salary disbursements'
      using errcode = '42501';
  end if;
  if v_method not in ('Cash', 'Bank transfer', 'Mobile Money', 'Cheque', 'Other') then
    raise exception 'Choose a valid salary payment method';
  end if;
  if v_reference is not null and length(v_reference) > 120 then
    raise exception 'Payment reference is too long';
  end if;

  select * into v_item
  from public.payroll_items
  where id = p_payroll_item_id
  for update;
  if not found then
    raise exception 'Payroll line was not found';
  end if;

  select * into v_period
  from public.payroll_periods
  where id = v_item.payroll_period_id
  for update;
  if not found or v_period.status not in ('Approved','Part-paid') then
    raise exception 'The Director must approve this payroll before payment is recorded';
  end if;
  if v_item.status <> 'Pending' then
    raise exception 'This payroll line is no longer awaiting payment';
  end if;
  if v_item.approved_net_pay_ugx is null
     or v_item.net_pay_ugx is distinct from v_item.approved_net_pay_ugx
     or v_item.net_pay_ugx is distinct from
       (v_item.base_salary_ugx + v_item.allowances_ugx - v_item.deductions_ugx - v_item.advance_recovery_ugx) then
    raise exception 'Approved payroll totals changed; stop and ask the Director to review this payroll';
  end if;

  update public.payroll_items
  set status = 'Paid',
      payment_method = v_method,
      payment_reference = v_reference,
      paid_at = now(),
      payment_recorded_by = auth.uid(),
      payment_recorded_at = now()
  where id = p_payroll_item_id;

  return jsonb_build_object('success', true, 'status', 'Paid',
    'payroll_item_id', p_payroll_item_id,
    'approved_net_pay_ugx', v_item.approved_net_pay_ugx);
end;
$function$;

revoke all on function public.record_school_payroll_item_payment(uuid, text, text)
  from public, anon;
grant execute on function public.record_school_payroll_item_payment(uuid, text, text)
  to authenticated, service_role;

commit;
