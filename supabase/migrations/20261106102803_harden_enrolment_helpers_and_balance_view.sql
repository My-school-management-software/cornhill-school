create or replace view public.learner_account_balances with (security_invoker=true) as
select s.id as student_id,s.admission_number,concat_ws(' ',s.first_name,s.middle_name,s.last_name) as learner_name,
 coalesce(ch.total_charged,0)::bigint as total_charged_ugx,coalesce(pa.total_allocated,0)::bigint as total_paid_ugx,
 coalesce(cr.total_credit,0)::bigint as credit_ugx,
 (coalesce(ch.total_charged,0)-coalesce(pa.total_allocated,0)-coalesce(cr.total_credit,0))::bigint as balance_ugx
from public.students s
left join public.learner_enrolment_periods current_ep on current_ep.student_id=s.id and current_ep.status='Active'
left join (select c.enrolment_period_id,sum(c.amount_ugx) total_charged from public.learner_charges c join public.learner_enrolment_periods ep on ep.id=c.enrolment_period_id and ep.status='Active' group by c.enrolment_period_id) ch on ch.enrolment_period_id=current_ep.id
left join (select c.enrolment_period_id,sum(a.amount_ugx) total_allocated from public.payment_allocations a join public.learner_charges c on c.id=a.charge_id join public.school_payments p on p.id=a.payment_id and p.status='Posted' join public.learner_enrolment_periods ep on ep.id=c.enrolment_period_id and ep.status='Active' group by c.enrolment_period_id) pa on pa.enrolment_period_id=current_ep.id
left join (select p.enrolment_period_id,sum(p.unallocated_amount_ugx) total_credit from public.school_payments p join public.learner_enrolment_periods ep on ep.id=p.enrolment_period_id and ep.status='Active' where p.status='Posted' group by p.enrolment_period_id) cr on cr.enrolment_period_id=current_ep.id;
revoke all on function public.create_initial_learner_enrolment_period() from public,anon,authenticated;
revoke all on function public.sync_learner_enrolment_status() from public,anon,authenticated;
revoke all on function public.assign_current_enrolment_to_new_charge() from public,anon,authenticated;
revoke all on function public.assign_current_enrolment_to_new_payment() from public,anon,authenticated;