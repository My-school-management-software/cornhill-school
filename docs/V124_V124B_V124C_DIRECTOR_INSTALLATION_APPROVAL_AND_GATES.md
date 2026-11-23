# V124 / V124B / V124C — Director installation authorisation record

**Director statement received in chat:** "proceed. but also I approve the installation" (23 November 2026, 14:39 Uganda time).

**Meaning:** Director has expressed willingness to authorise installation once the correct release has been checked and documented. This record is not a password, signed database instruction, or permission to ignore failed acceptance gates.

## Current technical status (last V124B user-provided SAFE JSON)

- V124B_ACCEPTANCE_BLOCKED, 1572 tests; 1570 passed, 1 failed, 1 skipped.
- Independent PostgreSQL 17 PASS, synthetic backup/restore PASS.
- Working backup/restore NOT_RUN, real logins NOT_TESTED, printer NOT_TESTED.
- The source includes locally newer V124/V124B files not necessarily mirrored on GitHub.
- Finance email delivery NOT_CONFIGURED and must remain disabled.
- Director approval in the historic JSON was false (the JSON predates this new approval).
- No safe installer executable or fully accepted V124C package has been produced.

## Safety and deployment procedure

1. Reconcile newer Windows installation/staging source with this GitHub branch via read-only hash inventory and isolated three-way merge. Preserve newer `public/leadership.html` and all changed files. Never overwrite based solely on old GitHub commit.
2. Obtain detailed regression log naming the failing test; resolve without weakening financial or identity integrity. Explicitly assess the skipped test.
3. Validate PostgreSQL reporting prototype against complete bursary, reversal, credit and re-admission ledger business rules. Prototype is **NOT FOR INSTALL**; never include it automatically in migration runner.
4. Complete read-only reporting API wiring, Director/Bursar navigation and role permissions. Confirm Director cannot post payments at both HTTP and DB boundaries.
5. Run full tests, independent PG17 migration/restore on disposable copy, verify backup of working database is private and restorable, test staff logins/printers on appropriate devices and verify no live data loss.
6. Prepare signed-off release manifest naming exactly which V124/V124B/V124C files/migrations will be installed, their hashes, expected user-visible changes, rollback steps and required downtime.
7. Reconfirm final *specific* installation batch with the Director if its actual effects differ materially from the earlier proposal. Explicitly request typed approval in the locally controlled installer before any working database write; never silently substitute chat approval for the installer's safeguard.
8. Do not enable Bursar invitations or send live emails without separate explicit approval. No automatic installation, branch merge, or production deployment.

**This file records the user's stated approval without claiming an installation occurred or bypassing V124B blockers.**
