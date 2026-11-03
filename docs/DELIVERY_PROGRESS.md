# Cornhill School System — Delivery Progress

Last updated: 2026-11-03 20:40 UTC

This tracker separates code committed to the development branch, database changes the school has applied, and features that are actually tested or live. A commit is not the same as a deployed or verified feature.

## Overall status

- **Development branch:** `feature/cornhill-v3-foundation`
- **Live production:** unchanged; `main` has not been updated by this work.
- **Current milestone:** USB staff attendance foundation (database migration applied and table presence verified; UI committed; end-to-end CSV import not yet tested with a real terminal export).
- **Physical fingerprint machine:** not purchased. Preferred candidate for evaluation: ZKTeco UA300 Pro.
- **Initial staff capacity target:** approximately 30 staff.
- **Connection selected by school:** USB export/import as the planned first connection method.

## Progress by module

| Module | Code/spec status | Applied to database | Tested/live |
|---|---|---|---|
| Staff login and basic roles | Foundation committed | Initial schema previously applied | Basic account/admin role previously verified; app not fully tested |
| Dashboard and module navigation | Dashboard and 10 module tiles committed; unfinished modules clearly labelled | Not applicable | Not yet deployed or browser-tested |
| Learner register and classes | Basic UI committed | Initial schema previously applied | Limited manual testing only |
| PWA install foundation | Manifest, icon and service worker committed | Not applicable | Installability still needs browser/hosting verification |
| Permanent learner code | Server-generated CHM/CHF + admission year + global sequence; app form no longer accepts a manual code | **Migration applied; column and triggers verified** | Transaction test generated CHF26-000001; test row rolled back; no real learner created |
| Teacher portal and class access gate | Spec only | No | No |
| Themes and fonts | Spec only | No | No |
| Staff profiles and HR documents | Basic administrator-only profile editor committed (contact, job, department, responsibilities and employment dates/status); confidential documents excluded pending private storage | **Fields, indexes and admin-only update policy applied and verified** | Not browser-tested; no confidential document storage yet |
| Staff attendance | Tables, device-ID mapping and admin USB import UI committed | **Applied; tables and RLS verified** | No real-device CSV test yet |
| USB fingerprint attendance import screen | Admin screen, staff-ID mapping, CSV parsing, validation and import committed | Uses applied attendance tables | Needs sample terminal CSV and test import |
| Fingerprint terminal integration | Device not purchased; candidate only | No | No |
| Academics, marks and report cards | Admin UI for years, terms, subjects, class/teacher assignments, assessments and marks committed; score/class validation in DB | **Six academic tables, indexes, RLS and score validation trigger applied and verified** | Not browser-tested; teacher self-service and report-card layouts remain future work |
| Fees, receipts and accounting | Spec only | No | No |
| Parent communication, LMS and other modules | Spec only | No | No |

## Latest completed coding milestone (2026-11-03)

- Added academic years and terms, subject catalogue, class-subject/teacher assignments, assessments and learner scores.
- Added administrator screens to configure the academic calendar, subjects, assignments and assessments, and enter or update marks.
- Database validation prevents marks above the assessment maximum and prevents scoring learners outside the assessment class.
- Enabled RLS on all academic tables; reads require sign-in and academic writes are currently administrator-only. Teacher portal permissions and report-card generation are not yet complete.


- Added staff profile fields for phone, job title, department, responsibilities, employment dates and status.
- Added administrator-only profile editing in the web app; staff cannot edit or promote their own profiles.
- Added database update policy and indexes; schema was verified after applying the change.
- Identity numbers, contracts and private documents remain excluded until a dedicated private storage bucket and access workflow are built.


- Added an administrator-only USB attendance import screen to the web app.
- Added mapping from the fingerprint machine's user ID to each staff account.
- Added CSV parsing, supported event checks, Uganda local-time conversion, preview of invalid rows and batch import.
- Applied the attendance migration to the Supabase project and verified the new tables and RLS are present.
- The screen is committed on the development branch; the live production site has not been updated.


- Added a no-login, read-only demo entry point with sample learners/classes so the owner can inspect the interface without exposing real school records or disabling Supabase authentication/RLS. Demo form controls are disabled and sample records are local to the browser.

## USB attendance plan

1. Supplier confirms the exact terminal model supports exporting attendance logs to USB in a documented CSV/Excel/TXT format.
2. Cornhill imports that export through an administrator-only screen.
3. The importer maps the machine's user ID to each staff member's Cornhill staff account, validates date/time and event type, previews accepted/rejected rows, and prevents duplicate imports.
4. Staff see their own attendance; authorized administrators see school-wide records.
5. Corrections are recorded as reviewed adjustments. Raw device events are not silently edited or deleted.

**Important:** USB mode is a file-transfer workflow, not automatic real-time synchronisation. The machine must retain attendance logs until the administrator exports them. Confirm export format and timezone with the supplier before purchase.

## How to read progress

- **Spec only:** requirements have been documented, but no working feature exists.
- **Code committed:** source code or a migration exists on the development branch.
- **Applied:** the migration or code has been installed in the target environment.
- **Tested:** the workflow has passed a documented test.
- **Live:** the tested version is deployed for school use.

We will update this tracker with every meaningful coding milestone and will not mark a feature complete merely because its plan or code has been committed.
