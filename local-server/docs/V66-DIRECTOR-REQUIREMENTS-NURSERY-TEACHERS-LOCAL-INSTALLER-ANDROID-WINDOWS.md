# CORNHILL V66 — Director's requirements: Nursery Teacher Materials, Local Downloads, Windows & Android

**Decision recorded:** 28 November 2026 (Uganda, EAT). **Status:** confirmed requirements, implementation/acceptance incomplete. This file records the user's directives for future work; it is not proof of a release or migration approval.

## 1. Nursery materials must appear in each respective teacher's own account

- The School Office continues to record **what each Nursery learner brought** individually and date each receipt; preserve the existing `material_deliveries` and published class requirement records.
- Each Baby, Middle, and Top class teacher must see a dedicated **Nursery Scholastic Materials** area inside their normal academic/staff account, not merely a School Office administrative screen.
- Teachers see **only learners in their currently assigned class(es)** based on `cornhill_auth.staff_class_assignments` and existing authorised staff authentication. A teacher cannot browse another class by changing a URL, and guardians have no access to internal materials.
- Per learner and material: requirement, brought/received, still to bring, issued to each authorised teacher, returned, outstanding in teacher custody, available in learner's budget, dates, actor, reason, and printable audit history.
- **A teacher's withdrawal must be charged only to materials actually brought by that learner**. No borrowing from another learner's balance. Concurrent devices must not overspend; database transaction locks and idempotent request IDs are required.
- Returns and corrections use append-only audit events. Teacher withdrawal history must not be silently edited/deleted. Office stock handover is a **separate** action, not a synonym for teacher issue.
- Existing V64 School Requirements UI and individual learner register must remain intact.
- V65 is **source-only** and not yet deployed. The V65 preflight on the working school PC reported 140 applied migrations, 3 Nursery classes, 484 learners, 142 materials-related schema columns, 9 materials-related functions and **no teacher custody table**. A new feature migration is required only after a review against the **actual 140-migration lineage**, followed by isolated PostgreSQL 17 rehearsal, verified backup/restore, staff permission and concurrency tests, and explicit Director approval.
- A read-only teacher materials panel may be deployed in advance using existing role- and class-scoped APIs. Until custody ledger is active, display the teacher-taken quantity as **not yet recorded**, never misleadingly as zero.

## 2. Local software must be downloadable from the school's existing installer/download link

The Director reports that the **live/hosted app is installable but the local software shows unavailable**. This is an unresolved release defect, not permission to substitute the hosted package or a ZIP of source.

- Separate validated artifacts: **Windows 10/11 local-host installer**, optional Windows LAN-client installer, and **Android APK** (staff client). The hosted PWA remains a clearly labeled separate fallback.
- The native shell in `native/cornhill-shell/src-tauri/tauri.conf.json` presently loads `https://cornhill-school-swart.vercel.app/`: it is a **hosted shell**, NOT a local school installer. Never describe this as the local download.
- The GitHub repository had **no published Releases** when examined 28 November 2026; no verified release asset URL currently exists. Avoid dead/fictional direct-download links.
- Establish a stable installer/download centre attached to the school's **existing permanent domain**, with distinct `Live software`, `Windows local`, and `Android local` entries and truthful availability. Expose verified download links only after signed (or clearly internal-test-only) artifacts are built, malware-scanned as applicable, SHA256-checked and tested on clean devices.
- Windows local-host installer must preserve the existing `cornhill_local` database, Director account and staff records, and must not overwrite local configuration/secrets. It must have a verified upgrade/rollback path; must not run incompatible GitHub V50 096–100 migrations on the working 140-migration DB.
- Windows/Android binaries must not contain `.env`, DB dumps, live learner data, signing keys, PINs, private tokens or backups.
- If distribution costs/verification are required, list them explicitly and keep the link marked **Not available yet** rather than offering a misleading executable. Publishing to the production installer site is a separate, controlled step.

## 3. Shared Windows 10/11 and Android architecture

- **One role-secured local API** and PostgreSQL data source on the authorised school host. Windows 10/11 browsers/EXE and Android browser/APK are **clients**; they must not create separate uncoordinated learner databases.
- Current `https://localhost:4174` is loopback-only; Android `localhost` points at the Android phone, **not the Windows PC**. Do not hardcode it as the Android backend URL.
- Before LAN activation, implement restricted-school-LAN hostname/discovery, device trust, TLS certificate verification on all devices, real session isolation, CSRF protection, and concurrent-user acceptance for 30+ devices. Never simply expose PostgreSQL port 5432 or disable HTTPS/TLS verification.
- Shared responsive UI for mouse, touch, screen reader and physical/mobile keyboard; test narrow-phone layouts, mark tables with safe horizontal scrolling, print previews, file uploads and camera, sign-in, session expiry and school role scopes.
- A mobile PWA installation is different from a signed native APK. A hosted Tauri wrapper is different from the local backend, and a Windows EXE shell is different from the PostgreSQL host installer.
- Offline-first with encrypted, device-scoped **non-financial drafts**; safe read-only offline last-known information where permitted; queued updates only after approved conflict resolution. Never queue/post real finance or student promotion in an unaccepted offline-sync workflow.
- Test on actual Windows 10, Windows 11, Android phones over wired and Wi-Fi LAN and with internet unavailable. The hosted version remains the separately protected fallback until data identity and sync reconciliation is accepted.

## Immediate acceptance gates

1. Read-only Nursery teacher view uses authorized current-class scope; unknown teacher issues displayed as **Not yet activated**.
2. V65 teacher movements: **not live**, and no migrations/real pupil transactions until approval.
3. Build a real Windows local installer and a real Android APK, test on devices, publish the resulting **actual release assets** with SHA256. Only then turn on download buttons at the existing installer link.
4. Incompatible migration version lineages 096–140, 9 local vs 8 hosted payment identities, incomplete LAN/offline acceptance remain release blockers.
5. Five formal full-system release blockers remain **0/5 independently cleared**. Do not treat a successful source test or UI install as production release acceptance.

**Progress reporting:** Use verified feature-specific counts and percentages; never infer overall completion from source tests.
