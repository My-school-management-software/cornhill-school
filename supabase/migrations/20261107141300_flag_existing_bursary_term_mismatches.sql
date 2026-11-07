-- Flag existing bursary records whose dates or billing label do not match the active term.
insert into public.school_notifications(category,severity,title,message,student_id,audience_role,action_workspace,source_key)
select 'bursary_review','urgent','Bursary approval needs term check-up',
  'This learner has a bursary record that does not match the currently active term. Check the approval period, validity dates and amount payable before relying on it.',
  s.id,'Admin','finance','bursary-review-current:'||s.id::text||':'||t.id::text
from public.students s cross join public.academic_terms t
left join public.academic_years y on y.id=t.academic_year_id
where s.status='Active' and t.is_current
  and exists(select 1 from public.learner_bursary_awards a where a.student_id=s.id)
  and not exists(select 1 from public.learner_bursary_awards a where a.student_id=s.id
    and a.effective_from<=t.ends_on and coalesce(a.effective_until,'infinity'::date)>=t.starts_on
    and lower(btrim(a.billing_period_label))=lower(btrim(t.name||' '||coalesce(y.name,''))))
on conflict (source_key) do nothing;
