# CORNHILL Parent Portal Work Plan

Last updated: 10 November 2026

## Current Parent Portal sign-in setting

- [x] The Guardian PIN requirement is controlled by an administrator-only ON/OFF switch in **Parent Portal Settings**.
- [x] Current database setting: **OFF**. Parents sign in using the learner's permanent pupil code and the registered guardian phone number.
- [x] When the switch is ON, parents must also enter the 8-digit Guardian PIN. The pupil code and registered phone remain mandatory in both modes.
- [x] The switch is OFF by default and is not enabled automatically by admission or by issuing a PIN.
- [x] Only an active CORNHILL Admin can view or change this setting. The setting change is recorded in a private audit table.
- [x] Enabling the PIN requirement revokes active parent sessions so existing sessions cannot bypass the newly enabled requirement.
- [x] Existing Guardian PIN hashes, recovery hashes, administrator issuance controls, and PIN-based database functions are retained when the requirement is OFF.
- [x] Staff and administrator authentication, staff PINs, and all other application sign-in systems are unchanged.
- [x] Server verification always checks the learner's permanent or recorded historical pupil code against the registered, active guardian phone contact. Archived learners remain blocked; repeated wrong code/phone pairs are throttled.

## How to operate the switch

1. Sign in with an active administrator account.
2. Open **Notification Centre → Parent Portal Settings**.
3. Find **Parent Portal sign-in settings**.
4. Leave the switch OFF for pupil code + registered guardian phone only.
5. To require Guardian PIN, first issue PINs to the guardians who need portal access, then switch it ON and confirm. Existing parent sessions are signed out.
6. To return to pupil code + phone only, switch it OFF. Issued PIN records are kept and can be used again if the setting is later switched ON.

## Remaining Parent Portal checks

- [ ] Test sign-in while the switch is OFF: correct pupil code + linked registered phone succeeds without a PIN.
- [ ] Test sign-in while OFF: wrong pupil code, wrong/unregistered phone, inactive guardian, and archived learner are rejected.
- [ ] Test sign-in while ON: a correct PIN is required in addition to the pupil code and registered phone.
- [ ] Test that enabling the switch revokes pre-existing parent sessions.
- [ ] Test that disabling the switch does not delete or regenerate PIN credentials.
- [ ] Test siblings sharing one phone; each pupil code must open only its matching learner.
- [ ] Verify parent profile, LIN, published results, fee balances, approved reports, parent messages, learner photo, and sign-out.
- [ ] Verify the setting page is visible only to an active administrator and the database rejects setting changes from other roles.
