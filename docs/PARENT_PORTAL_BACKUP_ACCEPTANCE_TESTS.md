# CORNHILL Parent Portal Privacy and Backup Security Test Batch

**Review date:** 6 November 2026  
**Environment:** connected Supabase project; read-only database inspection. No guardian, learner, backup or validation records were changed.

## Batch A — 14 parent/guardian privacy checks

All 14 passed:
1. Guardian directory RLS enabled.
2. Guardian contact change log RLS enabled.
3–4. No anonymous table grants on guardian directory or change log.
5. Parent learner lookup RPC not executable by anon.
6. Parent learner lookup RPC executable by authenticated users.
7. Guardian directory has administrator-only ALL policy.
8. Guardian contact change log has administrator-only read policy.
9. No learner has multiple active primary guardians.
10–11. SMS and WhatsApp opt-ins require their respective phone numbers.
12. Contact change log entries require a reason.
13–14. Change log references valid learner and actor records.

Inspected `parent_portal_get_learner`: it requires a signed-in user with a confirmed phone number, then matches that phone to an active guardian contact and the supplied permanent pupil code. The returned payload is scoped to that learner and includes published assessment data, published reports, posted payments, active enrolment balance and guardian-visible published conduct reports. Assessment data is gated by report publication. No anonymous access was found.

**Important integration boundary:** this relies on Supabase phone authentication having actually verified the guardian phone. This database review did not send an OTP or verify that an SMS provider/phone-auth delivery configuration is active. No separate portal OTP table exists in the inspected public schema. Actual guardian sign-in and learner isolation must be tested in browser with test accounts before launch.

## Batch B — 10 backup security and audit checks

All 10 passed:
15–19. RLS enabled on backup runs, settings, connection credentials, OAuth states and validation audit.
20. No anon table grants on backup metadata tables.
21. Backup validation history has administrator-only read policy.
22. Backup run record totals are non-negative.
23. Successful backup runs have completion timestamps.
24. Backup validation audit rows reference an existing backup run and user.

### Backup operational status (read-only)
- 8 recorded backup runs: 6 successful and 2 failed.
- 1 Google Drive connection record and 1 backup settings record.
- 0 backup validation audit records. The most recent backup has therefore not been independently validated through the validation workflow as of this check.
- No new backup was started, no validation was invoked, no schedule changed and no restore was attempted.

## Required follow-up
- Confirm Supabase phone OTP delivery is configured and test sign-in with a dedicated guardian test account.
- Verify one guardian cannot access another learner by changing the pupil code.
- Verify a former/inactive guardian contact is denied.
- Verify unpublished results and conduct reports remain hidden.
- Invoke the backup validation action as an authorised administrator, then inspect the audit result.
- Complete an isolated restore rehearsal before describing backups as recoverable.

These are read-only database security/integrity checks and source inspection, not full browser, OTP-delivery or restore tests.
