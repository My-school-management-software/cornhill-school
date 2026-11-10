# CORNHILL Parent Portal Work Plan

Last updated: 10 November 2026

## Current temporary testing configuration

- [x] Parent Portal sign-in requires the learner's permanent pupil code and the guardian phone number registered for that exact learner.
- [x] The separate Guardian PIN is temporarily inactive on the parent-facing sign-in screen; it is not requested for sign-in, reset, or change.
- [x] The pupil code remains mandatory, unchanged in the school learner register, and is displayed inside the portal after successful guardian verification.
- [x] Existing Guardian PIN hashes, administrator issuance controls, and PIN-based database functions are retained unchanged for future reactivation.
- [x] Server verification requires an active guardian contact linked to the learner resolved by the supplied pupil code; archived learners and ambiguous guardian links are rejected.
- [x] Failed code + phone attempts are throttled and audited using hashed identifiers; session expiry, report publication restrictions, and guardian-to-learner isolation remain in force.
- [x] Staff and administrator authentication, staff PINs, and other application sign-in systems are unchanged.

## Re-enable Guardian PIN — WAITING FOR SCHOOL AUTHORISATION

This item is deliberately inactive. Do not restore Guardian PIN sign-in until the school explicitly instructs the development team to do so.

When authorised:
1. Restore the Guardian PIN field on the Parent Portal sign-in screen.
2. Require the learner's permanent pupil code, registered guardian phone number, and the Guardian PIN.
3. Restore parent-facing PIN reset/change controls only after their recovery and lockout tests pass.
4. Keep the existing guardian PIN records, administrator issuance workflow, code history, and learner-code display.
5. Test current and historical pupil codes, siblings sharing one phone, inactive guardians, archived learners, wrong PINs, lockout, recovery, and session revocation.
6. Update the Parent Portal help text and this work plan to show the school-approved sign-in method.

## Remaining Parent Portal checks

- [ ] Test a correct pupil code + registered phone pair for one learner.
- [ ] Test a wrong pupil code with a correct registered phone and a correct code with an unregistered phone.
- [ ] Test siblings sharing one guardian phone; each pupil code must open only its matching learner.
- [ ] Test inactive guardian contacts and archived learners.
- [ ] Test throttling after repeated failed code + phone attempts.
- [ ] Verify the permanent pupil code, LIN, learner profile, published results, fee balances, and approved reports shown after sign-in.
- [ ] Verify parent messages, learner photo, school contacts, sign-out, and session expiry.
- [ ] Test the separate administrator Guardian PIN issuance screen; do not delete or regenerate existing PIN records during this temporary phase.
