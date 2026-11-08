# CORNHILL application integration map

## Non-negotiable design
The main School Management System is the system of record. Satellite applications are role-limited workspaces over the same Supabase records; they must not create parallel learner, staff, finance, attendance or guardian registers. Every write must retain the central record UUID and actor, and every read must enforce the same role/record permissions as the main system.

## Shared record ownership and hand-offs

| Application | Reads from / writes to | Integration contract |
|---|---|---|
| Public School Website | Published school information and approved public content | Public read-only; no private learner/staff data. |
| Admissions & Enquiries | `school_admission_enquiries` | Parent submits an enquiry; Admin reviews it; approved details are prefilled into the main learner registration form; only after Admin saves the learner is `student_id` linked and the enquiry marked Registered. No duplicate learner record is created by the public form. |
| Learner Register | `students`, `parent_guardian_contacts`, classes, learner charges | Canonical learner identity, permanent pupil code, LIN, guardian links and admission status. Other apps must reference `students.id`. |
| Parents Portal | Approved guardian-to-learner relationships, learner results, attendance summaries, balances and notices | Guardian sees only learners explicitly linked to that verified guardian; never exposes staff/admin data or other learners. |
| Evidence Capture | `evidence_capture_requests`, `evidence_capture_files`, private `cornhill-private-evidence` storage | Evidence is requested against an existing record using `context_type` + `context_record_id`; captured file metadata remains linked to the request and therefore the originating record. Keep storage private and signed URLs short-lived. |
| Staff Profiles / HR | `user_profiles`, `school_staff_directory`, `academic_teacher_directory` | One staff identity. Directory-only records are promoted/linked to a login profile by Admin; do not create a second staff identity. HR documents use Evidence Capture with `staff_profile` and the directory/profile UUID. |
| Staff Attendance Kiosk | Existing staff identity and attendance event tables | Attendance is written against the canonical staff user/profile ID; kiosk is not a separate employee register. |
| Banking & Daily Deposits | Finance transactions and evidence requests | Bank deposits/withdrawals link to finance transaction IDs; bank evidence is requested using the transaction context and reviewed in Evidence Capture. |
| Finance / Receipts | Learners, fee schedules, charges, payments, receipts, bursaries | Payment search uses canonical learner ID/code; receipts and balances derive from posted finance records, not a duplicate app ledger. |
| School Services Portal | Canonical learner/staff IDs plus each service's domain tables | Library, transport, welfare, visitors, assets, learning resources and HR must store central IDs and enforce their own role scopes. |
| Staff Communications & Events | Staff profiles, approved groups and communication tables | Recipient selection resolves to canonical staff IDs. Attachments originate from the current computer/phone only; this is intentionally separate from Evidence Capture's record-document workflow. |

## Evidence Capture workflow
1. Open Evidence Capture from the originating staff/learner/finance record with its record UUID in the URL.
2. If the required document is already stored on the computer, attach it through the originating record's approved upload control (when that control exists); do not request a second copy.
3. If no suitable file is available, issue a time-limited capture request to an authorised paired phone. Use a specific purpose such as Staff application letter, Staff national ID, Staff academic certificates or Staff appointment letter.
4. Keep the request's `context_type` and `context_record_id` unchanged through upload, review and replacement requests.
5. Evidence is not treated as verified until an authorised administrator reviews it. Rejected/unclear evidence remains visible in the audit trail.

## Access and account separation
- Staff accounts are authenticated separately; never share one session across users or silently switch accounts.
- Parent applicant accounts must be separate from staff accounts and the internal admin system.
- Parent applicant status is limited to enquiries submitted by that authenticated account. A public anonymous enquiry must not reveal private status to someone who only knows a reference number.
- Communication attachments stay local to the user's chosen device upload and are not silently copied into personnel/learner evidence.

## Release gates before production
- Audit every app route and registry URL against the actual deployed branch.
- Verify row-level security and private storage policies for every new record relationship.
- Test parent ownership isolation, staff account isolation, cross-record evidence isolation and administrator review.
- Test upload limits, unsupported file types, expired capture requests, offline behaviour and retries.
- Confirm Vercel production deployment is built from the reviewed integration branch before calling a feature live.
