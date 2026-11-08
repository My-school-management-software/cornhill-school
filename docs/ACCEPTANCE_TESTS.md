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
- [ ] CORNHILL's password-change and recovery screens enforce the agreed password length/character-class rules and perform the free breach-list check. Confirm the limitation is documented: this app-level check is not Supabase server-side leaked-password enforcement.

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

## C.1 Bulk assessment setup and original workbook import — blocking

- [ ] Administrator previews the all-class assessment preparation summary for the selected term.
- [ ] Preparation creates only missing subject/period assessments for Baby, Middle, Top and P1–P7; it must not duplicate existing assessments.
- [ ] Repeating the preparation after a successful run creates zero additional assessment records.
- [ ] The original Excel workbook for each class is recognised by its worksheet name and learner-name heading, including P6's "PUPIL'S NAMES".
- [ ] Subject abbreviations map to the correct curriculum subject and period for that class.
- [ ] Formula/summary columns (TT, PN, AGG, DIV, POTN), comments, boarding/bursary fields and grade legends are not imported as marks.
- [ ] Learners match by permanent pupil code, LIN or unambiguous full name; conflicts and duplicate rows block import.
- [ ] Preview displays every unmatched learner, unknown subject heading, period mismatch, duplicate and invalid score before saving.
- [ ] A workbook with any blocking issue cannot be imported until corrected.
- [ ] Importing one workbook does not overwrite existing marks unless the teacher explicitly enables replacement.
- [ ] Teacher's main mark sheet shows all subjects for the assigned class and the applicable periods together; individual missed-paper entry remains available separately.
- [ ] A teacher cannot prepare school-wide assessments, promote learners, or open administrator-only Work Plan.

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
- [ ] Internet interruption shows the offline warning and the application clearly distinguishes local drafts from server-confirmed records.
- [ ] Teacher mark drafts may be saved locally for the assigned class while offline, but remain unofficial until conflict-checked synchronisation succeeds; verify conflict retention and retry on reconnect.
- [ ] Staff attendance currently queues correction requests locally; do not treat this as offline clock-in/out capture. Verify the correction queue and retry behaviour separately.
- [ ] Finance/payment posting remains online-only and must never be silently queued or posted offline.
- [ ] Do not claim full offline operation until browser runtime tests confirm durable storage, retry, conflict handling, cross-account isolation and reconnect behaviour.

## G. Deployment and release sign-off

- [ ] Latest branch commit has a successful Vercel deployment.
- [ ] The deployed preview is checked on Android and a Windows computer.
- [ ] Browser console and network requests show no blocking errors during the tests.
- [ ] Database security advisors are reviewed; unresolved warnings are documented and accepted by the school administrator.
- [ ] A backup/restore procedure and named system administrator are confirmed.
- [ ] School administrator signs off before production records or real payments are entered.

## Current known launch limitations

- The active branch is still under development and must pass the checks above before school-wide production use.
- The latest release audit observed two learner rows, zero assessment rows, zero saved assessment scores, two payment rows and zero payment allocations. These small datasets are insufficient for full multi-learner marks, payment-allocation and report-card workflow tests. Confirm current class/teacher assignments before live use.
- Offline support includes the app shell, time-limited read-only class snapshots, local form autosave, teacher assessment drafts and staff attendance correction requests. These are source-verified foundations, not yet browser/device-verified full offline operation. Live finance posting and server records require internet.
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

## I. Offline and multi-device operation

- [ ] Open the app online, then disconnect the device; confirm the cached shell loads and clearly states that live records are unavailable.
- [ ] Confirm no learner admission, marks, attendance or finance write is reported as saved while offline unless it is explicitly queued with a visible pending-sync status.
- [ ] Reconnect and verify queued non-financial changes sync once only, with conflict reporting and a retry option.
- [ ] Confirm payments and receipt numbers cannot be created offline or duplicated during reconnect.
- [ ] Verify a second device sees the same server-confirmed changes after refresh/sign-in.

## J. Administrator reports and appearance

- [ ] Confirm a Teacher or Staff account cannot open administrator reports or confidential learner exports.
- [ ] Confirm the administrator report counts match the live learner/class/assessment records.
- [ ] Export the learner register and verify its class, gender, LIN and admission-code columns.
- [ ] Verify each of the 8 themes, 24 font choices, 4 text sizes, 10 dashboard layouts and motion preference applies and persists after refresh.
