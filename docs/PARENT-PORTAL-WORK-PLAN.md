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

## Atomic parent-session security

- [x] Parent Portal session creation now locks the current Guardian PIN setting while it writes the session. This serializes a sign-in against an administrator enabling the PIN requirement: either the session is created first and then revoked by the setting change, or the sign-in sees the new ON setting and must verify the PIN.
- [x] Session issuance rechecks the active registered guardian contact and learner archive status in the same transaction.
- [x] When Guardian PIN is ON, the session transaction verifies the current PIN hash again under the guardian-contact row lock, preventing a PIN reset/change during sign-in from issuing a session with the old PIN.
- [x] The session-creation database function is executable only by the server service role; the browser cannot call it directly.
- [x] Automated regression coverage checks the policy-row lock, contact/learner locks, server-side PIN recheck, and restricted function privileges.

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


## Guardian contact data repair — 10 November 2026

- [x] Audited all 486 non-archived learner records for guardian names and phone numbers.
- [x] Created and reconciled active primary Parent Portal links for all 8 learners whose existing register records contain both a guardian name and a valid Ugandan phone number.
- [x] Confirmed all 8 repaired links match the source learner's normalized registered phone and permanent pupil code.
- [x] Executed the server-side code + phone verification function against all 8 repaired pairs with the Guardian PIN requirement OFF; all 8 returned their matching learner records. Test login-attempt writes were rolled back.
- [x] Deactivated 2 previously active guardian links that belonged to archived learners. Credential hashes were retained; archived learners remain blocked.
- [x] Added a database trigger so future learner admissions and changes to guardian name/phone automatically synchronize the primary guardian link. Invalid or incomplete source details do not create a fabricated guardian identity.
- [x] Added automatic guardian-link deactivation when a learner is archived.
- [x] Enabled row-level security on private parent login-attempt records and removed browser-role table access; the server service role retains the required access.
- [x] Added regression tests for phone normalization, admission sync, contact changes, archive handling, messaging-consent defaults, and login-attempt security.
- [x] GitHub Actions regression suite passed: 172 tests, 0 failures.
- [x] Vercel preview for the updated branch is READY.
- [ ] Three active learner records have a guardian phone but no guardian name; the school must confirm the correct guardian names before they can be linked.
- [ ] The remaining 475 active learner records have no registered guardian phone; the school must collect and verify the guardian contact details before Parent Portal access can be enabled for them.
- [ ] Complete manual sign-in checks on Android and desktop browsers, including the specific P.2 learner and published marks/results.

The current Guardian PIN requirement remains **OFF**. No SMS or WhatsApp consent was enabled by this repair.
