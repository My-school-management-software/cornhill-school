# CORNHILL cross-application integration audit — 9 November 2026

## Design rule

The CORNHILL Supabase project is the shared source of truth. Apps may have separate screens, install links and permissions, but they should not create a second learner or employee identity. Foreign keys identify the main record; readable names/codes are retained only as display snapshots where an operational register needs them.

## Current application connections

| App / workspace | Shared record source | Connection and boundary |
|---|---|---|
| Main School Management | `students`, `school_classes`, `user_profiles`, academic and finance tables | Canonical learner and staff records; administrators manage admission and HR; teachers see assigned classes and subjects only. |
| Public Admissions | `school_admission_enquiries` | Parent email/password account is an Auth identity. A signed-in enquiry stores its owner in the existing `submitted_by` field; parents can read only enquiries belonging to that account. Guest enquiries remain possible with no account owner. |
| Admin Admissions queue | `school_admission_enquiries.student_id` → `students.id` | The administrator reviews the enquiry, opens the existing learner-registration form with the safe fields prefilled, supplies/validates required data (gender, date/birth year, class, LIN, etc.), then saves once. The original enquiry is linked to the resulting learner record and marked Registered. Approval by itself does not manufacture a partial learner record. |
| Existing Parent & Guardian Portal | `parent_guardian_contacts`, `parent_portal_sessions`, `students` | PIN/guardian verification remains separate from staff accounts and is scoped to the verified learner. It does not expose the administration system. |
| Evidence Capture | `evidence_capture_requests`, `evidence_capture_files`, `evidence_capture_reviews`; private `cornhill-private-evidence` bucket | Each request carries a context type and the exact main-record ID. Existing PC/phone files can be uploaded by an administrator; when no saved file exists, an authorised paired phone can capture photos/PDF pages. Admin review remains required. |
| Staff profiles / HR | `school_staff_directory`, `user_profiles`, `academic_teacher_directory` | Staff application letter, National ID/NIN, qualification and appointment documents open Evidence Capture against the selected staff record. New invitations require selection of an existing employee record; the deployed staff-invite function links the login to that row and links/creates the academic teacher directory entry for Teachers. |
| Learner profiles | `students.id` | The learner profile includes a linked document area for birth certificate, previous report, transfer letter and other supporting documents. It opens Evidence Capture against that learner ID. The learner photograph remains in its dedicated private photo flow. |
| Banking & daily deposits | `school_bank_transactions`, bank account ledger tables and evidence context `bank_transaction` | Banking requests evidence against the bank transaction ID; evidence review is part of the existing verification workflow. |
| Finance / expenses | School expense and payment tables; evidence contexts `school_expense` and `school_expense_request` | Receipt/slip capture is tied to the relevant expense or request, not copied into a separate finance database. Posted payments and ledger controls remain in the main finance workflow. |
| Staff attendance | `user_profiles`, `staff_attendance_events`, schedules and adjustment tables | Attendance records reference the employee account. Fingerprint imports remain pending verified hardware and the Windows bridge. No claim of live fingerprint hardware connection is made. |
| School Services — library | `school_library_loans.student_id` / `borrower_user_id`, `school_library_books` | Learner loans select the central learner record; staff loans select an active staff account where available. The database enforces a learner link for borrower type Learner. Non-login employees have an explicitly labelled manual fallback until they are issued an account. |
| School Services — transport | `school_transport_assignments.student_id`, `school_transport_routes` | Operators select the active learner from a restricted central lookup; a database trigger fills the displayed learner name, permanent code and class from the main register. |
| School Services — welfare | `school_welfare_cases.student_id` | Welfare officers can optionally link a case to a learner. When selected, a database trigger fills the name and permanent code from the central register. The case itself remains restricted to authorised welfare roles. |
| School Services — notices / calendar / HR / facilities / visitors | `school_staff_notices`, `school_calendar_events`, HR, assets, visitor and maintenance tables | The main dashboard bridge reads shared notices/events and provides role-permitted links into the same School Services workspace. |
| Staff communication | `staff_communication_posts`, direct/media message tables and private staff-media storage | Chat attachments continue to come directly from the staff member's computer or phone storage. Evidence Capture is deliberately not inserted into the communication centre. |

## Evidence context types

The Evidence Capture link supports the existing contexts for bank deposits/transactions and expenses, plus `staff_profile`, `school_staff_directory`, `academic_teacher_directory`, `learner_profile`, `parent_document`, `learner_bursary_award` and `inventory_item`. Files are private; only authorised signed links are generated for review/display.

The local upload route creates an admin-owned pending request with no assigned capture device. The paired-phone route continues to require an active device and assigned operator. Both routes save the same request/file metadata and review records.

## Installation and access

Installable web-app manifests now exist for:
- Main school management
- Banking & daily deposits
- Evidence Capture
- Parent admissions
- Parent & Guardian Portal
- School Services
- Public school website

On supported Windows browsers, users open the assigned HTTPS page and choose the browser's Install app command. On Android, use the browser's Add to Home screen / Install app command. This is a browser-installed PWA, not a Windows `.exe` installer. The App Centre remains role-filtered; sharing a link does not bypass the sign-in or database policies.

## Verification performed

- Confirmed the configured Supabase project is active and healthy.
- Inspected the public schema, RLS policies, evidence storage buckets, and school-app registry.
- Confirmed the parent enquiry owner column already existed as `submitted_by`; the admissions screen reuses it rather than adding a duplicate ownership field.
- Confirmed RLS policies exist for applicants to submit their own enquiries and read only their own application statuses.
- Confirmed Evidence Capture storage is private and the admin upload policy is scoped to a pending request created by that administrator.
- Expanded and verified the database evidence-purpose constraint to accept staff application letter, staff national ID, staff certificates, staff appointment letter, academic qualification, birth certificate, previous report and transfer letter, alongside the original bank/expense and general types. Evidence Capture is enabled in the App Centre for Admin, Teacher and Staff roles.
- Confirmed the evidence request's device/user fields allow null only for the administrator's local-computer upload path; paired phone capture still uses the assigned-device controls.
- Added and checked foreign-key columns for learner-facing library, transport and welfare records. Those three tables had zero rows at audit time, so there was no legacy data to guess/backfill.
- Confirmed the service learner view is granted to authenticated users, the staff-directory lookup RPC is executable, and the limited learner identity columns are selectable. RLS limits the rows to active learners and approved job titles; guardian contact fields are not included in that view.
- Deployed the updated `staff-invite` Edge Function (active, JWT verification enabled). The new flow requires an employee record and links the invited Auth/profile identity back to that record; for Teachers it also links or creates the academic teacher directory entry.
- Parsed the inline JavaScript in the main app (9 blocks), admissions page (1), evidence page (1), and School Services page (2), plus the service worker: no syntax errors found in those files at the time of the check.

## Known limits / next checks

1. Vercel has a READY preview at commit `c639fb40996880b12bb918664cdbd7340a20270d` (`cornhill-school-3x2kla7b6-cypher-projects1.vercel.app`). The application source is at commit `8cfd4fc78d0419a253d339fb7e402a7d356b0621` (the current branch head `ee8777637db3899f8f7f7c7c6ffa72703c46d705` adds the final audit update), so that preview is behind the latest source. A manual Vercel deployment request was refused by the free daily deployment API quota (more than 100 deployments; retry after the quota window). Do not treat that older READY preview as proof that the latest final files are live. No production alias was changed.
2. Browser interaction tests with a real administrator account, a separate Teacher account, a Transport/Librarian/Welfare account, a guardian email-confirmation flow, and a paired Android phone still need to be run. Source syntax and database structure checks are not substitutes for these end-to-end tests.
3. Existing unlinked staff/teacher directory entries are not automatically merged by matching a name. The new invitation form lets the administrator select the exact employee record; any older duplicates should be manually verified before linking.
4. Staff-library loans for employees without a CORNHILL login retain a clearly labelled manual path. Learner loans and logged-in staff loans are linked to their main records.
5. The school-fees and admissions-requirements structure mentioned by the school has not yet been attached in this work session. No fee amounts or additional admission requirements have been invented; that structure must be read before configuring those values.
6. Offline shell access does not mean that parent accounts, evidence uploads, payments, messages or database writes work without an internet connection. These operations require a live authenticated connection unless a separately tested offline queue is provided.


## 9 November 2026 follow-on — Notification Centre, Records Centre and scanner

- Added `/notifications.html` as the central Inbox / History / My archived interface. It reads through `list_school_notification_center`, supports search, priority/category filters, read receipts, personal archive/restore, linked action routes and a 20-second foreground refresh. Optional browser notifications work while the page is open; closed-browser Web Push is not configured.
- Added `/records.html` as an Admin-only search and verification interface for the existing `school_record_index`. It displays source references, issuing authority, identifiers, issue/expiry dates, OCR status/text, private original-file previews, verification status and notes.
- The Records Centre can re-run OCR for PDFs and image files. PDF text is extracted directly when embedded; image-only pages are rendered and OCR'd. Extracted text is sent to the existing `save_school_record_ocr_text` RPC and remains searchable in the same record index. Expiry/issue dates are still administrator-reviewed fields; OCR does not silently approve or assign expiry dates.
- Expanded the expiry alert generator to staged 30-day, 7-day, expiry-day and expired notifications, resolving an old stage when the document changes status/date. The active `pg_cron` job runs daily at 03:00 UTC / 06:00 Africa/Kampala.
- Added notification triggers for attendance adjustments and incidents, salary advances, payroll item status, welfare case opening/status changes (generic text only), asset maintenance, visitor check-in/check-out, report card publication and bursary awards. Existing admission, evidence, banking, expense, leave, attendance-alert and parent-message triggers remain active.
- Added per-user notification restoration. Archiving or restoring changes only the signed-in user's notification state; it never deletes or rewrites the underlying school event.
- Added Notification Centre and Records Centre App Centre entries. Notification Centre is assigned to Admin/Teacher/Staff; Records Centre is Admin-only. Both pages also have PWA manifests, service-worker cache entries and install prompts.
- Improved the existing evidence scanner default to a colour-preserving Smart document contrast enhancement. The scanner continues to support separate scan and take-photo paths, crop, rotate, multi-page PDF and OCR, plus original/colour/grayscale/black-and-white filters. Edge cropping is still user-adjusted; automatic edge detection is not guaranteed across devices.
- Bulk checks passed: migration application; cron and trigger presence; notification RPC grants; private storage configuration; file-index uniqueness, source-key uniqueness and zero-orphan checks; page JavaScript syntax; and static ID wiring for the two new centre pages. At audit time, there were no evidence files or indexed documents in the live database, so no actual scanned document was available for an end-to-end OCR check.
- See [NOTIFICATION_RECORDS_BULK_TEST_PLAN_20261109.md](NOTIFICATION_RECORDS_BULK_TEST_PLAN_20261109.md) for the 44 automated checks and remaining manual tests.

- Corrected and re-applied the report-publication trigger's academic-term lookup after schema verification: the actual `academic_terms` display column is `name`, not `term_name`. The source migration and a follow-up corrective migration now use the verified column.
