revoke all on function public.assign_school_invoice_no() from public, anon, authenticated;
revoke all on function public.inventory_prevent_negative_stock() from public, anon, authenticated;
revoke all on function public.inventory_touch_updated_at() from public, anon, authenticated;
revoke all on function public.log_learner_status_change() from public, anon, authenticated;
revoke all on function public.refresh_daily_collection_record_after_payment() from public, anon, authenticated;
revoke all on function public.stamp_bursary_award_approval() from public, anon, authenticated;
revoke all on function public.validate_assessment_score() from public, anon, authenticated;

comment on function public.assign_school_invoice_no() is 'Trigger-only function; direct client execution is revoked.';
comment on function public.inventory_prevent_negative_stock() is 'Trigger-only function; direct client execution is revoked.';
comment on function public.inventory_touch_updated_at() is 'Trigger-only function; direct client execution is revoked.';
comment on function public.log_learner_status_change() is 'Trigger-only function; direct client execution is revoked.';
comment on function public.refresh_daily_collection_record_after_payment() is 'Trigger-only function; direct client execution is revoked.';
comment on function public.stamp_bursary_award_approval() is 'Trigger-only function; direct client execution is revoked.';
comment on function public.validate_assessment_score() is 'Trigger-only function; direct client execution is revoked.';
