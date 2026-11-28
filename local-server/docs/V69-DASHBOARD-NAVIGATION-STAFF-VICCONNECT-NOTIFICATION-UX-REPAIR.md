# CORNHILL V69 — Navigation and screen-quality defect report

**Source of issues:** Director's Windows screenshots and 28 November 2026 feedback; **not** a production deployment report.

## A. Navigation safety — urgent

The green CORNHILL top toolbar has Back, Home, Forward, Refresh and Sign out. The Director pressed a navigation control and was returned to sign-in rather than stopping at the Dashboard.

Source investigation in the **installed 140-migration local lineage** (V63 source review) found `public/offline-status.js` uses `history.back()` and `history.forward()` on unprotected pages; on protected pages it traverses `window.navigation` entries using scope metadata. These paths may leave the intended dashboard, particularly where the page lacks the expected protected-workspace marker. This does **not prove** the logout endpoint was called.

**V69 source-only fix prepared in a local ZIP for controlled Windows installation:**
- Back and Home route to the current account's authorised Dashboard and stop there; both controls are disabled/ineffective at that boundary.
- Forward is disabled rather than navigating into an old or another user's session.
- The explicit Sign out button and server-side logout logic are unchanged.
- A valid session is still required before navigation. Expired/revoked sessions must still require sign-in.
- Patch is anchored on exact old code and makes a backup; 5 focused synthetic tests passed, with no database operations.

**V69 installer ZIP:** `CORNHILL-V69-NAVIGATION-FIX-AND-UI-REVIEW.zip`. Await Director's Windows installation and browser verification before calling the navigation defect resolved.

## B. Staff overview

The leadership staff overview screenshot shows **19 total staff**, but *Teaching staff*, *Non-teaching staff*, and gender splits display dashes because approved local staff profiles do not currently contain teaching category / gender classification. Staff records are present; do not claim 19 missing.

- Add an **authorised, accurate teaching vs non-teaching classification** based on a staff attribute the school explicitly approves; do not invent data from staff names.
- Only show gender breakdown when gender is recorded by an authorised staff source and allowed by school access policy. Otherwise display “Not recorded”, not misleading blank cards.
- Render a searchable staff directory with role/status/assigned class as permitted, and add legible cards linking to Staff Profiles.
- Never infer gender from job titles or names or invent counts.

## C. VIC Connect/staff communications

Screenshot shows separate Conversations, Staff directory, Colleagues multi-select and Create staff group, but layout is crowded, and the director reports it is substantially inferior to the live preview implementation.

- Compare the **real installed local** `school-services.html/js/css`, `vicconnect.js`, and root hosted preview source before modifying workflows.
- Use responsive two-column chat+conversation list on desktop, stacked/mobile panel on Android, compact search, staff avatar initials, role badges, conversation unread badges, accessible composer and send status; keep existing server-side role scope and message isolation.
- Never fake chats, delivery receipts, staff availability or unread counts.
- Preserve unread conversations, attachments, voice support only where existing API/security contracts permit. Don't introduce paid SMS or permissions changes without review.

## D. Notifications & approvals

Current local screenshot has dense text links, browser-default purple list items, weak hierarchy, and a plain “0 unread”; Director wants modern styled cards, icons and **numbered unread badges**.

- Organize notices, approvals, school calendar and tasks in separate tabs/cards; clear typography and icons, responsive desktop/Android layout, accessible keyboard navigation.
- Show numerical unread badges **only from authorised real unread counts**. Zero may appear as “No new notifications”; no invented numbers.
- Distinguish notification read-only view from actions; use existing protected endpoints and accurate pending counts.
- Present genuine role-scoped notification details and mark-read only when supported by backend; no fabricated interactions.

## E. Existing V68 status and blockers

The Director's PowerShell confirms V68 installed (5 local source files updated; no database/finance writes), and screenshot shows the new visual Parent & Guardian PIN view requirement. Formal full-system release blockers remain 0/5, V65 Nursery teacher withdrawals not activated, Windows and Android local installers not published.

## Next implementation step

The V69 combined source-only package collects **exact, locally installed UI files** for staff dashboard, VIC Connect, notifications, leadership, shared navigation and related API modules into `CORNHILL-V69-UI-SOURCE-REVIEW-*.zip` without learner records, database dumps, financial reports, `.env`, PINs or keys. The Director reviews the ZIP for accidental embedded private content before sharing it. Implement the V70 layout, badges and staff listing against those exact files with protected read-only counts and a conflict-safe backup/rollback installer.

**All edits and tests must preserve the installed 140-migration lineage, 484 active learners and current finance reconciliation lock.**
