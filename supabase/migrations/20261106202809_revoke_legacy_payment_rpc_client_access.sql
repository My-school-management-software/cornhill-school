revoke all on function public.post_school_payment_with_allocations(uuid,bigint,text,text,text,jsonb) from public, anon, authenticated;

comment on function public.post_school_payment_with_allocations(uuid,bigint,text,text,text,jsonb) is
'Deprecated legacy payment RPC. Client execution revoked; the current application uses post_school_payment_complete with active-enrolment and current-term allocation controls.';
