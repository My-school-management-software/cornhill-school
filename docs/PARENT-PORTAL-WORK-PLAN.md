# CORNHILL Parent Portal Work Plan

Last updated: 10 November 2026

## Current temporary testing configuration

- [x] Parent Portal sign-in temporarily uses the guardian's registered Ugandan phone number and 8-digit Guardian PIN.
- [x] Learner pupil code is not requested at sign-in, PIN reset, or PIN change during this temporary testing phase.
- [x] The permanent pupil code remains unchanged in the school learner register and is still displayed as learner information after successful guardian verification.
- [x] Existing code-based database authentication functions are retained. Do not delete them during this temporary phase.
- [x] Phone-only sign-in must still resolve exactly one active guardian contact/learner using the phone + PIN pair; archived learners remain blocked.
- [x] PIN lockout, recovery-code checks, session revocation, report publication restrictions, and guardian-to-learner isolation remain in force.

## Re-enable pupil-code verification — WAITING FOR SCHOOL AUTHORISATION

This item is deliberately not active. Do not re-enable it until the school explicitly instructs the development team to do so.

When authorised:
1. Restore the learner pupil-code field on Parent Portal sign-in.
2. Require the current permanent pupil code together with the registered guardian phone number and PIN.
3. Restore pupil-code verification to PIN reset and PIN change, if the school still wants it as an additional check.
4. Keep legacy-code history handling and permanent pupil-code display.
5. Test current codes, historical codes, siblings sharing one phone, inactive guardians, archived learners, wrong PINs, lockout, recovery, and session revocation.
6. Update the Parent Portal help text and this work plan to show the school-approved sign-in method.

## Remaining Parent Portal checks

- [ ] Test phone + PIN with a guardian contact linked to one learner.
- [ ] Test a guardian phone shared across siblings with distinct PINs.
- [ ] Test the two existing guardian records and issue their PINs from an authenticated administrator account.
- [ ] Test admission-in-progress records and automatic PIN issuance after learner save.
- [ ] Test reset/change PIN without pupil-code entry.
- [ ] Verify the learner's permanent pupil code is still visible inside the authenticated portal.
- [ ] Verify parent access remains limited to the learner linked to the matched guardian contact.
