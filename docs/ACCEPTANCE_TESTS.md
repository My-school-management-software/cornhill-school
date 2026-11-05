# CORNHILL launch acceptance checklist

This checklist is the release gate for the first real school use. Run it with the school administrator and one designated teacher per test class. Use clearly marked test learners and test payments only. Do not test by posting a real family payment and then reversing it.

## A. Access and account security — blocking

- [ ] Administrator can sign in with the administrator's own account.
- [ ] Administrator can sign out; the session is no longer usable on that device.
- [ ] Each teacher has an individual account and a named class/subject assignment.
- [ ] A teacher can read only the classes and subjects assigned to that teacher.
- [ ] A teacher cannot open Finance, staff HR, payroll, inventory administration, or other administrator-only areas by changing the URL or browser state.
- [ ] A teacher cannot read another class by changing a class ID in a request.
- [ ] A teacher cannot edit marks for a class/subject not assigned to them.
- [ ] Password reset works through the secure account email flow.
- [ ] No service-role or secret key is present in browser source, local storage, or network responses.
- [ ] Supabase Auth leaked-password protection is enabled before production use.

**Important:** Selecting a class tile on the public sign-in page is not, by itself, proof of class access control. Verify the database Row Level Security rules with a real teacher account.

## B. Learner admission and class register

- [ ] Administrator can admit a test learner and the system generates a unique, permanent learner code.
- [ ] LIN can be saved and searched.
- [ ] Learner name, gender, date of birth, class, guardian contact and learner status save and reload correctly.
- [ ] Bursary selection requires a bursary amount and creates the expected fee charge.
- [ ] Duplicate learner code is rejected.
- [ ] Class register shows the correct learner and supports search, status filters, CSV export and printing.
- [ ] Promotion records the previous and new class without changing the learner's permanent code.
- [ ] Transferred, withdrawn and graduated learners are not counted as active learners.

## C. Class structure and marks

- [ ] Baby, Middle, Top and P1–P7 are present and mapped to the correct school class records.
- [ ] Each class has its correct subjects; no unrelated class subjects appear.
- [ ] Teacher can enter marks in the class-wide spreadsheet and save them.
- [ ] Beginning, Midterm and End-of-Term columns are all visible on phone and computer (horizontal scrolling is acceptable).
- [ ] Saved marks reload after sign-out/sign-in.
- [ ] Invalid scores above the assessment maximum are rejected.
- [ ] Nursery and P1–P3 do not accept the P4–P7 absence marker X.
- [ ] P4–P7 absence marker X behaves as specified and suppresses aggregate/division where required.
- [ ] Nursery performance bands/comments and P1–P3 positions calculate correctly.
- [ ] P4–P7 use the configured UNEB-style grades, aggregates and divisions; they do not show class positions.
- [ ] P7 index number is shown and printed correctly.
- [ ] A second teacher cannot overwrite marks outside their assigned class/subject.

## D. Report cards and printing

- [ ] Individual report card matches the learner, class and selected term.
- [ ] Class batch contains every active learner in the selected class exactly once.
- [ ] Each learner begins on a separate PDF/printed page.
- [ ] School badge, school name, term, year, LIN and P7 index number (where applicable) are legible.
- [ ] All subject marks, totals, grades, aggregates/positions, comments and remarks are correct for the class level.
- [ ] Downloaded PDF opens on Android and Windows and can be printed.
- [ ] Print preview is checked before bulk printing.

## E. Finance — test only until signed off

- [ ] Only authorised finance/admin users can access payments and balances.
- [ ] A test learner charge appears in the correct term and currency (UGX).
- [ ] A test payment can be allocated between prior-term balance and current fees.
- [ ] Receipt number is unique and receipt shows learner code/name, payer, method, amount and allocations.
- [ ] Duplicate submission does not create a second payment.
- [ ] A posted payment cannot be silently edited or deleted.
- [ ] Reversal requires administrator permission and a reason; the original receipt remains auditable.
- [ ] Bursary learners are charged the configured bursary amount rather than the normal full fee.
- [ ] Thermal printer layout is tested on the actual 58mm/80mm printer before relying on it.
- [ ] Do not send parent SMS until a provider, sender identity, costs and consent process are configured.

## F. Attendance, offline and devices

- [ ] Staff attendance CSV import is tested with a sample export and duplicate rows are handled safely.
- [ ] Device serial number and staff-ID mapping are confirmed against the actual fingerprint terminal.
- [ ] Fingerprint terminal is tested at the school office; this web app does not itself capture fingerprints.
- [ ] Android installation and Windows browser access are tested.
- [ ] Internet interruption shows the offline warning. Do not enter marks or payments while offline.
- [ ] Do not claim full offline record entry or automatic synchronisation until durable local storage, retry and conflict tests pass.

## G. Deployment and release sign-off

- [ ] Latest branch commit has a successful Vercel deployment.
- [ ] The deployed preview is checked on Android and a Windows computer.
- [ ] Browser console and network requests show no blocking errors during the tests.
- [ ] Database security advisors are reviewed; unresolved warnings are documented and accepted by the school administrator.
- [ ] A backup/restore procedure and named system administrator are confirmed.
- [ ] School administrator signs off before production records or real payments are entered.

## Current known launch limitations

- The active branch is still under development and must pass the checks above before school-wide production use.
- The current database snapshot has only one learner, one assessment, no assessment scores and one class-subject assignment. The administrator must complete real class/teacher setup before teachers can use their mark books.
- Offline support caches the app shell only. Live records and payments require internet.
- Fingerprint hardware, thermal printers, SMS delivery and full offline synchronisation have not been validated end-to-end.

## H. Staff communication — test with two authorised staff accounts

- [ ] A staff member can publish an update to an allowed audience; users outside that audience cannot read it.
- [ ] A private text message reaches only the selected recipient and sender.
- [ ] A new incoming message increments the navigation badge and appears in the recipient's incoming-message alert.
- [ ] Opening a conversation marks only the recipient's messages as read and clears the correct unread count.
- [ ] Voice-note recording shows a recording timer/state, stops cleanly, uploads and plays for the recipient.
- [ ] Video recording opens a live camera preview, shows recording state, uploads and plays for the recipient.
- [ ] A voice call and a video call can be started, answered, declined and ended by the two test accounts.
- [ ] A third staff account cannot read another pair's private messages or media objects.
- [ ] Denied microphone/camera permission, interrupted upload and unavailable media playback show clear errors without leaving the recorder or call active.
