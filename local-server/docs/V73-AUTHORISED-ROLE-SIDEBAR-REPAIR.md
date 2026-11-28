# CORNHILL V73 — Compact *actual* staff-workspace navigation (not only Dashboard)

Date: 28 November 2026. Director screenshots showed a long **Director → Workspaces** sidebar still visible in School Office and Academics **after V71 had reported successful installation**. This is a different menu from the Dashboard's `school-navigation`: authenticated staff workspaces construct their menu dynamically in `local-server/public/offline-status.js`, based on permission-filtered `GET /api/v1/auth/workspaces`, and its layout is in `offline-status.css`.

The Director asked to improve **that** sidebar also: concise names, small icons, simple groups, better spacing, less width and better Android presentation, without removing any authorised feature or moving unrelated records into the wrong department.

**V73 local-only repair prepared** from the V69 exact Windows source snapshot:
- `CORNHILL-V73-COMPACT-AUTHORISED-WORKSPACE-MENU.zip` in the associated ChatGPT conversation (not a GitHub public installer).
- Changes only `offline-status.js` menu-rendering block and appends namespaced `offline-status.css`. Does not alter V69 Back/Home boundaries, sign-out control, server routes or role permissions.
- Compact labels (Office, Learners, Requirements, Admissions, Staff, Attendance, Finance, VIC Connect, Alerts, Account) preserve original full labels in `aria-label` and tooltips; small inline SVG icons (no extra assets). Role badge, collapsible groups with accessible `aria-expanded`, selected page highlighted. Sidebar target 208 px; phone-width sidebar collapses in a summary menu.
- Every link remains an **authorised item provided by the server**. No invented routes, additional API writes, cross-class access or privilege escalation. Sign out is separate from navigation.
- Fixed-backup Windows PowerShell 5.1 installer with UTF-8 BOM and strict SHA256 validation of installed baseline (V69 source archive) and new package; on unexpected changes safely aborts. Pre-install JS syntax check and 8 source regression tests, source backups and rollback. Two files only. No DB, finance or cloud writes.
- Node.js tests: **8/8 passed**. Simulated Chromium desktop 1280px and Android-like 390px rendering passed: links, permissions, initial collapse, active highlight, group interaction. **Not yet installed on the Director's computer; no real-account UI acceptance yet.**

**Important lineage constraints:** The 140-migration Windows database and GitHub V70/older V50 base diverge at 096–100; do NOT apply repository migrations to the working school. This V73 visual ZIP makes no database changes. Formal full-school release gates remain **0/5 independently cleared**.

**Acceptance:** open School Office → Learners, Academics, Leadership; Ctrl+F5; confirm concise role sidebar appears across modules, authorized links remain present, and Back/Home stops at Dashboard without signing out. Test Director and restricted teacher accounts, then mobile width. If SHA mismatch stop and review local source rather than overwrite.