-- CORNHILL: enable controlled Bursar payment posting while keeping reversals Director-only.
--
-- The existing post_school_payment RPC performs a multi-step, atomic operation:
-- create the receipt, allocate payments against learner charges, and update the
-- unallocated balance. The underlying school_payments RLS insert/update policies
-- intentionally remain administrator-only. This narrowly scoped SECURITY DEFINER
-- RPC is the only delegated path for active finance operators to post receipts.
--
-- All object references are schema-qualified and search_path is empty because the
-- function executes with its owner's privileges. Authorization is checked inside
-- the function before it touches any school data.

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
  if v_uid is null or not coalesce(public.is_school_finance_operator(), false) then
    raise exception 'Only an active school finance operator may post learner payments'
      using errcode = '42501';
  end if;

  if p_student_id is null or p_amount_ugx is null or p_amount_ugx <= 0 then
    raise exception 'Select a learner and enter a payment amount greater than zero';
  end if;

  if p_payment_method is null or p_payment_method not in ('Cash', 'Mobile Money', 'Bank Transfer', 'Card', 'Other') then
    raise exception 'Invalid payment method';
  end if;

  if not exists (
    select 1
    from public.students s
    where s.id = p_student_id
  ) then
    raise exception 'Learner was not found';
  end if;

  v_receipt :=
    'CHR-' ||
    to_char(timezone('Africa/Kampala', now()), 'YYYY') ||
    '-' ||
    lpad(nextval('public.school_receipt_seq')::text, 6, '0');

  insert into public.school_payments (
    id,
    receipt_no,
    student_id,
    amount_ugx,
    unallocated_amount_ugx,
    payment_method,
    payment_reference,
    notes,
    received_by
  )
  values (
    v_payment_id,
    v_receipt,
    p_student_id,
    p_amount_ugx,
    p_amount_ugx,
    p_payment_method,
    nullif(trim(p_payment_reference), ''),
    nullif(trim(p_notes), ''),
    v_uid
  );

  for v_charge in
    select c.id, c.amount_ugx
    from public.learner_charges c
    where c.student_id = p_student_id
    order by c.created_at, c.id
    for update
  loop
    exit when v_remaining <= 0;

    select coalesce(sum(a.amount_ugx), 0)
      into v_paid
    from public.payment_allocations a
    join public.school_payments p on p.id = a.payment_id
    where a.charge_id = v_charge.id
      and p.status = 'Posted';

    v_due := v_charge.amount_ugx - v_paid;

    if v_due > 0 then
      insert into public.payment_allocations (
        payment_id,
        charge_id,
        amount_ugx
      )
      values (
        v_payment_id,
        v_charge.id,
        least(v_due, v_remaining)
      );

      v_remaining := v_remaining - least(v_due, v_remaining);
    end if;
  end loop;

  update public.school_payments
     set unallocated_amount_ugx = v_remaining
   where id = v_payment_id;

  return query
  select v_payment_id, v_receipt, v_remaining;
end;
$function$;

-- Do not expose this privileged function to anonymous callers.
revoke all on function public.post_school_payment(uuid, bigint, text, text, text)
  from public, anon;
grant execute on function public.post_school_payment(uuid, bigint, text, text, text)
  to authenticated, service_role;

-- Bursars must submit expense requests; only Director-approved requests are posted
-- after the evidence-review trigger. Remove the legacy direct INSERT path that
-- allowed a finance operator to insert a Posted expense without that approval.
drop policy if exists "Finance operators record school expenses"
  on public.school_expenses;

-- A Bursar may post a new payment, but must not reverse or erase a receipt.
-- Keep this function SECURITY INVOKER so the existing administrator-only UPDATE
-- RLS policy remains an independent second check.
create or replace function public.reverse_school_payment(
  p_payment_id uuid,
  p_reason text
)
returns table (
  payment_id uuid,
  receipt_no text,
  status text,
  reversed_at timestamp with time zone
)
language plpgsql
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_payment public.school_payments%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_when timestamptz := now();
begin
  if v_uid is null or not coalesce(public.is_school_admin(), false) then
    raise exception 'Only the Director or an authorised school administrator may reverse a payment'
      using errcode = '42501';
  end if;

  if p_payment_id is null then
    raise exception 'Select a receipt to reverse';
  end if;

  if v_reason is null or length(v_reason) < 5 or length(v_reason) > 500 then
    raise exception 'Enter a reversal reason between 5 and 500 characters';
  end if;

  select *
    into v_payment
  from public.school_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment receipt was not found';
  end if;

  if v_payment.status <> 'Posted' then
    raise exception 'Only a posted receipt can be reversed; current status is %', v_payment.status;
  end if;

  update public.school_payments
     set status = 'Reversed',
         reversed_at = v_when,
         reversed_by = v_uid,
         reversal_reason = v_reason
   where id = p_payment_id;

  return query
  select p.id, p.receipt_no, p.status, p.reversed_at
  from public.school_payments p
  where p.id = p_payment_id;
end;
$function$;

revoke all on function public.reverse_school_payment(uuid, text)
  from public, anon;
grant execute on function public.reverse_school_payment(uuid, text)
  to authenticated, service_role;
