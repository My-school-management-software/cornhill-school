# Cornhill School System — Delivery Progress

Last updated: 2026-11-03

This tracker separates code committed to the development branch, database changes the school has applied, and features that are actually tested or live. A commit is not the same as a deployed or verified feature.

## Overall status

- **Development branch:** `feature/cornhill-v3-foundation`
- **Live production:** unchanged; `main` has not been updated by this work.
- **Current milestone:** staff attendance foundation (database design committed; not yet applied or tested in the Supabase project).
- **Physical fingerprint machine:** not purchased. Preferred candidate for evaluation: ZKTeco UA300 Pro.
- **Initial staff capacity target:** approximately 30 staff.
- **Connection selected by school:** USB export/import as the planned first connection method.

## Progress by module

| Module | Code/spec status | Applied to database | Tested/live |
|---|---|---|---|
| Staff login and basic roles | Foundation committed | Initial schema previously applied | Basic account/admin role previously verified; app not fully tested |
| Learner register and classes | Basic UI committed | Initial schema previously applied | Limited manual testing only |
| PWA install foundation | Manifest, icon and service worker committed | Not applicable | Installability still needs browser/hosting verification |
| Permanent learner code | Spec only | No | No |
| Teacher portal and class access gate | Spec only | No | No |
| Themes and fonts | Spec only | No | No |
| Staff profiles and HR documents | Spec only | No | No |
| Staff attendance | Initial database migration committed | **Not yet applied** | No |
| USB fingerprint attendance import screen | Planned next | No | No |
| Fingerprint terminal integration | Device not purchased; candidate only | No | No |
| Academics, marks and report cards | Spec only | No | No |
| Fees, receipts and accounting | Spec only | No | No |
| Parent communication, LMS and other modules | Spec only | No | No |

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
