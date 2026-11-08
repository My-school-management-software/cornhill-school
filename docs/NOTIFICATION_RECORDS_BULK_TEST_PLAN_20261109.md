# CORNHILL Notification Centre, Records Centre and Evidence Capture — bulk test report

Date: 9 November 2026  
Branch: `fix/assessment-selection-save-preview-20261108`  
Database: `yemhortbudwbcrzsoozk`

## What is in this release

- A shared Notification Centre using `school_notifications` and `school_notification_user_state`; it does not create another event store.
- A Records Centre using `school_record_index`; original files remain in the existing private `cornhill-private-evidence` storage bucket.
- New database notifications for attendance adjustment/incident reviews, salary advance decisions, payroll status, restricted welfare case changes, asset maintenance, visitor check-in/out, report publication and bursary awards. Existing admissions, evidence, banking, expense, staff leave, attendance-alert and parent-message events remain in place.
- A daily expiry alert job at 06:00 Africa/Kampala, with separate stages for 30 days, 7 days, the expiry date and already-expired records.
- The existing Evidence Capture scanner, now with a colour-preserving Smart document filter selected by default. It still supports original/colour, grayscale and clean black-and-white output.

## Automated checks performed

| ID | Check | Result |
|---|---|---|
| DB-01 | Notification and records migrations apply successfully | PASS |
| DB-02 | App Centre contains active Notification Centre and Records Centre entries | PASS |
| DB-03 | Notification Centre app is assigned to Admin, Teacher and Staff | PASS |
| DB-04 | Records Centre registry is Admin-only | PASS |
| DB-05 | `list_school_notification_center` exists with inbox/history/archive parameters | PASS |
| DB-06 | Notification read and archive RPCs exist | PASS |
| DB-07 | Per-user notification restore RPC exists | PASS |
| DB-08 | OCR text-save RPC exists | PASS |
| DB-09 | Administrator expiry-refresh RPC exists | PASS |
| DB-10 | Daily expiry cron job exists and is active at 03:00 UTC / 06:00 Kampala | PASS |
| DB-11 | 18 expected admission/evidence/banking/expense/attendance/payroll/welfare/visitor/assets/report/bursary notification triggers are present | PASS |
| DB-12 | Evidence auto-index trigger is present | PASS |
| DB-13 | Evidence submission notification trigger is present | PASS |
| DB-14 | Expiry generator executes without error | PASS — 0 new alerts because there are currently no indexed documents |
| DB-15 | Notification RPC is executable by authenticated accounts but not anon/public | PASS |
| DB-16 | Restore RPC is executable by authenticated accounts but not anon/public | PASS |
| DB-17 | Direct SELECT on notification and per-user notification-state tables is not granted to anon or authenticated clients | PASS |
| DB-18 | Records index is selectable through grants, with table RLS restricting rows to administrators | PASS |
| DB-19 | Evidence storage bucket is private | PASS |
| DB-20 | Evidence bucket MIME allow-list is JPEG, PNG, WebP and PDF | PASS |
| DB-21 | Evidence bucket maximum file size is 15 MB | PASS |
| DB-22 | Evidence-file to records-index one-to-one uniqueness constraint/index exists | PASS |
| DB-23 | OCR full-text search index exists | PASS |
| DB-24 | Records expiry/date and source-context indexes exist | PASS |
| DB-25 | Indexed document rows without an evidence-file row | PASS — 0 |
| DB-26 | Evidence files without an index row | PASS — 0 |
| DB-27 | Duplicate evidence-file index entries | PASS — 0 |
| DB-28 | Duplicate notification source keys | PASS — 0 |
| DB-29 | Notifications referencing missing learner rows | PASS — 0 |
| DB-30 | Per-user notification states referencing missing notifications | PASS — 0 |
| DB-31 | Admin full-text Records Centre search RPC uses OCR search index and denies anon execution | PASS |
| UI-01 | Notification Centre inline JavaScript parses | PASS |
| UI-02 | Records Centre inline JavaScript parses | PASS |
| UI-03 | Evidence Capture inline JavaScript parses after scanner enhancement | PASS |
| UI-04 | Admissions inline JavaScript parses | PASS |
| UI-05 | School Services inline scripts parse | PASS |
| UI-06 | Parent Portal inline JavaScript parses | PASS |
| UI-07 | Public school website inline JavaScript parses | PASS |
| UI-08 | Banking inline JavaScript parses | PASS |
| UI-09 | Service worker JavaScript parses | PASS |
| UI-10 | Notification Centre static element references resolve | PASS — no missing IDs |
| UI-11 | Records Centre static element references resolve | PASS — no missing IDs |
| UI-12 | Both new centres link their manifest and register the service worker | PASS |
| UI-13 | Evidence Capture has separate Scan document and Take photo controls | PASS |
| UI-14 | Scanner supports crop, rotate, multiple pages, PDF build and OCR path | PASS — source inspection and syntax only |

### Current database data status

At the time of the check, `evidence_capture_files` and `school_record_index` each contained zero rows. Therefore the zero-orphan checks are valid structural checks, but no existing production documents were available for a live OCR/preview test. The notification table contained four pre-existing notifications and no duplicate source keys.

## Manual end-to-end checks still required

These require a real authorised account and/or a physical camera, and were not simulated by inserting false records into the live school database:

1. Sign in as Admin and confirm all notification categories and approval actions are visible.
2. Sign in as a Teacher and verify that only their personal/role notifications and assigned-class learner notices appear.
3. Sign in as a non-teaching Staff account and verify job/role scoping.
4. Submit a genuine online learner admission enquiry and confirm the Admin notification, linked admission reference and parent status page.
5. Change an admission enquiry status and verify the parent account sees the update while another parent cannot.
6. Mark a notification read, archive it, restore it and check that this changes only that user's inbox state.
7. Submit a genuine evidence capture from an authorised Android phone and verify the Admin alert.
8. Use the PC/phone local file upload route and confirm the same private evidence/index pipeline.
9. Open the scanner on Android, grant camera permission, capture a page, adjust crop/rotation, test all four filters and inspect the generated PDF.
10. Scan a multi-page paper document and confirm the OCR text appears in the Records Centre search.
11. Run OCR on a PDF and an image from the Records Centre and manually compare the text with the originals.
12. Enter a document expiry date, save it and check the 30-day/7-day/today/expired reminders at the corresponding date boundaries.
13. Verify that rejected, verified and archived documents show the correct status and that an archived document no longer generates renewal alerts.
14. Check browser notification permission on Chrome/Edge/Android. Background push when the browser is fully closed is not enabled in this release.
15. Install each PWA on Windows and Android, update the service worker and verify the new centre pages open from their icons.
16. Repeat file preview and OCR on a low-memory phone and a desktop browser; confirm file sizes stay inside the 15 MB storage policy.

## Security advisor observations

The project-wide Supabase security advisor still reports pre-existing items, including extension placement, leaked-password protection configuration, multiple existing SECURITY DEFINER RPCs and RLS-enabled audit/state tables without direct client policies. The new notification table deliberately has no direct client SELECT grant; the new SECURITY DEFINER list/restore RPCs validate the active user and scope data to that user's role, assigned class or personal state. The Records Centre is enforced as Admin-only in both the app registry and the page's active-profile check, with RLS on the records index. These advisor items should remain part of the wider CORNHILL security review; this test pass did not silently alter unrelated school permissions.

## Release status

The SQL changes are applied to Supabase, and the latest source is saved in the feature branch. Code parsing and structural/database checks passed. Physical-device, real-user workflow testing is still pending. A READY Vercel preview exists at https://cornhill-school-n5lnnn7bx-cypher-projects1.vercel.app (deployment commit f5e15ed01d8e0638a74eacd2dcfab16ee1d1c292). Git blob hashes were compared for 13 key UI files between that preview commit and the current branch; all matched. The branch is newer only because of a report-trigger SQL correction and documentation commits, and the corrected SQL is already applied to Supabase. The preview is therefore suitable for UI testing, though real account/camera testing is still required.
