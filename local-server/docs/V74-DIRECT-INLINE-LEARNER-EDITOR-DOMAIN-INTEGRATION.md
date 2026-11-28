# CORNHILL V74 — Director's one-window learner editor; source-only staged local repair

**Directive confirmed 28/11/2026:** In Learner Register → Edit learner profile, authorised staff must complete missing learner, guardian, fee, requirement and academic details **inside the same editor**. No links to other workspaces except exactly one **Parent Access** link to the secure parent sign-in screen where the parent enters pupil code, registered telephone and PIN. Every saved change must reach its own authoritative departmental service; no miscellaneous general-purpose school-record updates. The Director additionally confirms V73 compact sidebar installed: 8/8 tests, two UI source files modified, no database changes.

## Implementation staged as Windows ZIP

The ChatGPT conversation contains a source-only, integrity-checking **V74** ZIP constructed from the exact Windows V63 source snapshot and the already-installed V72 learner editor. The package changes School Office's learner dialog + JS + CSS, and inserts a new role-gated guardian-contact HTTP handler in the installed 140-migration runtime. It only applies to exact compatible source blocks, runs 15 focused tests, creates backups and includes rollback. No database/cloud/finance migrations or writes occur during installation.

The **single permitted external link inside the modal** is `/guardian` — the **parent login form**, not the privileged guardian administration office.

### Direct editor capabilities
- Learner identity: original audited `PATCH /api/v1/school/learners/:id/profile`, no new privilege.
- Guardian contacts: new `GET/PATCH /api/v1/school/learners/:id/guardian-contacts` with `learners.read` + `learners.guardians_manage` staff authorization, assigned-class restriction, HTTPS and CSRF requirement, locked learner/contact transaction, protected same-phone account handling, one contact at a time, insert/update only to the selected learner, staff-actor audit event, no PIN handling or plaintext display. Permission/grant metadata is checked live; if runtime SQL role lacks SELECT/INSERT/UPDATE grants, editing **fails closed** and the UI disables Save. No automatic DB grants.
- Requirements: read actual `/api/v1/school-requirements/catalog` and `/workspace` and collect materials via existing per-learner idempotent `POST /deliveries`. School Office receives/records. Never charge to a different learner.
- Fees: authorised real learner account from `GET /api/v1/finance/learners/:id/account`, totals/obligations **read-only**. No payment or fee editing/allocations enabled in this version until the protected Finance workflow can be integrated in the editor.
- Academics: protected learner report-card history **read-only**; no marks or promotions posted in V74.
- Values use textContent and role-scoped requests; not stored in browser; stale learner data cleared on dialog close/change.

**Status:** V74 package created and 15/15 focused tests passed; synthetic full School Office JS rebuilt from V63 -> V72 -> V74 with valid Node.js syntax. **Not yet installed or accepted on Director's working PC.** PowerShell 5.1 smoke verification must still be performed there. Role-column grants must be verified on actual 140-migration DB before guardian contact Save may become available. Do NOT copy SQL from unrelated GitHub 096–100 branch.

## Remaining implementation
1. Confirm local guardian_contacts read/update privileges; if missing, create reviewed and independently clone-tested grant migration **after the verified 140-migration lineage**, with Director approval, then accept guardian save.
2. Finance: integrate *proper* authorised fee/bursary correction workflows and receipt history without bypassing 9-local vs 8-cloud finance identity conflict. Director account must remain oversight-only, not direct payments.
3. Academics: integrate proper per-assessment mark-edit workflows and approval rules into the modal, not a generic unsafe PATCH.
4. Materials: add approved per-Nursery-learner teacher withdrawal ledger, returns and custody detail (V65 still not live); do not enable without clone tests.
5. Verify all field updates arrive at correct authoritative registers, including authorized guardian portal view, Office materials, Bursar ledger and Academics history; test permission isolation and data non-leakage.

**Release blockers independently cleared: 0/5.** UI patch acceptance does not authorize global Windows EXE/Android APK distribution or hosted finance synchronization.
