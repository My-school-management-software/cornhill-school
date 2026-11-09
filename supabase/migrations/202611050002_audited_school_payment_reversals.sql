-- Audited receipt reversals. Preserve original payments and allocations; exclude reversed rows
-- from learner balances and collection reports through the existing Posted-status filters.
alter table public.school_payments
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references public.user_profiles(id),
  add column if not exists reversal_reason text;

create or replace function public.reverse_school_payment(
  p_payment_id uuid,
  p_reason text
) returns table(payment_id uuid, receipt_no text, status text, reversed_at timestamptz)
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_payment public.school_payments%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_when timestamptz := now();
begin
  if v_uid is null or not coalesce(public.is_school_admin(), false) then
    raise exception 'Only an authenticated school administrator may reverse a payment'
      using errcode = '42501';
  end if;
  if p_payment_id is null then
    raise exception 'Select a receipt to reverse';
  end if;
  if v_reason is null or length(v_reason) < 5 or length(v_reason) > 500 then
    raise exception 'Enter a reversal reason between 5 and 500 characters';
  end if;

  select * into v_payment
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
$$;

revoke all on function public.reverse_school_payment(uuid, text) from public, anon;
grant execute on function public.reverse_school_payment(uuid, text) to authenticated;
