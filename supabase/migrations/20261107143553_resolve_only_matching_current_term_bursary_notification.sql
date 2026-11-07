create or replace function public.clear_bursary_review_notification_on_approval()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
  update public.school_notifications n set archived_at=coalesce(n.archived_at,now()),resolved_at=now(),
    archived_by=coalesce(n.archived_by,new.approved_by),
    archive_reason='Resolved after a new bursary approval for this academic term'
  where n.student_id=new.student_id and n.category='bursary_review' and n.resolved_at is null
    and new.effective_from<=current_date and new.effective_until>=current_date
    and exists(select 1 from public.academic_terms t join public.academic_years y on y.id=t.academic_year_id
      where t.is_current and lower(btrim(new.billing_period_label))=lower(btrim(y.name||' · '||t.name))
        and n.source_key in (
          'bursary-review:'||new.student_id::text||':'||t.id::text,
          'bursary-review-current:'||new.student_id::text||':'||t.id::text
        ));
  return new;
end;
$fn$;