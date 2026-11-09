-- Automatically suppress an unsent guardian payment SMS when its receipt is reversed.
-- The original outbox row remains as an audit record; no SMS is sent for a reversed payment.
create or replace function public.cancel_pending_parent_sms_on_payment_reversal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'Reversed' and old.status is distinct from 'Reversed' then
    update public.school_sms_outbox
    set status = 'Cancelled',
        last_error = 'Cancelled because the linked CORNHILL payment receipt was reversed.'
    where payment_id = new.id
      and status = 'Pending';
  end if;
  return new;
end;
$function$;

revoke all on function public.cancel_pending_parent_sms_on_payment_reversal() from public, anon, authenticated;

drop trigger if exists school_payments_cancel_pending_parent_sms on public.school_payments;
create trigger school_payments_cancel_pending_parent_sms
after update of status on public.school_payments
for each row
when (new.status = 'Reversed' and old.status is distinct from 'Reversed')
execute function public.cancel_pending_parent_sms_on_payment_reversal();
