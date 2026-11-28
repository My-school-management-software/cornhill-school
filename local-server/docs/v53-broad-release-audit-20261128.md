# CORNHILL V53 — Broad release audit and safe installation plan

**Audit date:** 28 November 2026 (Uganda/EAT)  
**Scope:** GitHub V50 candidate, local V52 guardian installation evidence, connected Supabase production metadata (read-only), Vercel deployment metadata (read-only).  
**Status:** RELEASE BLOCKED. This report does not authorize migrations, automatic learner promotion, financial posting, live cloud/local synchronization, or production promotion.

## Verified now

| Area | Actual evidence | Conclusion |
| --- | --- | --- |
| Parent/Guardian local | V52 installation returned `CORNHILL_V52_GUARDIAN_INSTALLED=TRUE`; 27/27 focused tests; page opened | Source/install/visibility passed. Real guardian + PIN + permissions acceptance still open. |
| New-year academic advancement | V50 code supports explicit per-learner Promote/Repeat/P7 Complete, 1–100 manually selected decisions, atomic rollback, immutable history via migration 095 | Source and isolated CI passed. Not installed in working database; year-scoped rosters and real school approval not accepted. |
| Github candidate | PR #79 remains **draft**; branch V50; isolated PostgreSQL 17 and Windows CI passed at `949590a` and later commits | Test green does not grant deployment readiness; local 125 dirty tracked paths require reconciliation. |
| Local migration safety | V49 safe preflight reported 096–097 source present but not applied, DB migration state not read | Do not apply 094–100 to real data without verified backup and successful disposable clone rehearsal. |
| Cloud project | Supabase `yemhortbudwbcrzsoozk` is ACTIVE_HEALTHY on PostgreSQL 17.11 | Cloud service is alive; this is not proof of business-workflow correctness. |
| Cloud learners / payments | Read-only counts: 484 students; 8/8 cloud payment records Posted | Preserve existing data and reconcile before syncing. |
| Cloud backup | 33 recorded runs: 23 success, 10 historical failed; most recent success 28 Nov 2026 02:00 UTC (05:00 EAT). Recorded validations: 5 passed and 3 failed, latest passed 21 Nov. | Backup job produces successful runs, but a current full restore test is still required before any migration. |
| Finance compare | Prior V20 local/cloud source-ID match for 484 learners; 9 local vs 8 cloud posted payments; **0** candidate matches by learner+amount, method, or date; receipt identities not verified | **Hard stop on payment synchronization, merging or replay, and unrestricted live finance release.** |
| Vercel | `cornhill-school` preview deployments from V50 branch are READY. `cornhill-install-center` and `cornhill-staff-activation` have READY production deployments. | Preview being READY is not a full local installer or production app release. Do not promote preview or replace cloud fallback automatically. |

## Five formal readiness blockers — unchanged

1. `frontend_not_integrated` — working-PC screens, workflows and production-local module parity not accepted.
2. `school_api_parity_incomplete` — locally modified modules and source-only V50 endpoints not independently accepted.
3. `hosted_dependencies_pending` — hosted-service paths still need local-only replacements and data movement checks.
4. `offline_sync_not_accepted` — no verified cross-device offline conflict handling; finance identity mismatch is unresolved.
5. `multi_device_acceptance_pending` — loopback-only HTTPS:4174 and PostgreSQL non-loopback listener security review; no 30-device acceptance.

**Verified cleared: 0/5.** Workspace page visibility is not a substitute for those gates. A global overall “98% complete” estimate would be misleading.

## Connected Supabase advisory findings (read-only)

Advisories, not confirmed vulnerabilities:
- Security **WARN**: 81 authenticated-executable SECURITY DEFINER functions; an inspection found 76 directly reference `auth.uid()` and the other 5 use helper-function based permission checks or other logic. Review their entire call graph and GRANT policy before changing any permission.
- Security **WARN**: `pg_net` extension in `public`; Auth leaked-password-protection warning. 
- Security **INFO**: 30 RLS-enabled tables without direct policies (many may be deliberately staff-only/private).
- Performance **WARN**: 77 multiple permissive policy notices.
- Performance **INFO**: 122 unindexed foreign keys, 76 unused indexes.
- Supabase health advisor returned no health lints.

**No database permissions were altered.** Do not blanket-revoke 81 function grants or add permissive RLS policies: doing so can break the working school website or make data accessible.

References:
- Supabase advisor: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Supabase RLS advisor: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Supabase policy performance advisor: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

## Actual remaining functionality and high-priority fixes

**Finance / School Fees (hold installation):** V50 fee-rate schema and A/B reporting compiled on isolated PostgreSQL 17, but annual Director approval screen and controlled fee-charge creation were not complete, old posted-receipt identity mismatch remains, classification of historical graduation charges must be reviewed, per-item 58/80mm prints and split allocations need acceptance. No new real school payments were posted.

**Year/term and enrolment:** Need cross-year term activation rehearsals, per-learner promotion/repetition approval on a clone of representative records, P7 graduation/hold-back, no automatic promotions, year-filtered P7/School Office roster, no loss of old report-card/finance history, and confirmation of new-year fees only. Nursery individual materials collection from office remains subject to migration 096–097 acceptance; new-year materials obligation reset still incomplete.

**Accounts / parents / payroll:** Verify real guardian access code+registered phone then staff-issued PIN; guardian isolation across siblings, phone changes and revoked guardian contact; Director-controlled staff codes, bursar invitations/approval, attendance kiosk and payroll deduction workflows. Role and offline session changes need interactive review.

**Packaging / local-first:** Windows EXE installer/versioned rollback, Android APK and permission model, offline multi-device synchronization/resolve conflicts, HTTPS SAN and Windows firewall for LAN, PostgreSQL listener restriction, staged backups/restore test, 30-device load testing.

## Prepared non-destructive tooling

`local-server/scripts/cornhill-v53-broad-readiness.ps1` inventories local guardian fields, migration source presence (not whether applied), Git status counts, HTTPS and PostgreSQL listener safety, and five release blockers. It saves a safe JSON report under Downloads. It does **not** connect to PostgreSQL, inspect learner records or secrets, post money, run migrations or deploy.

Run only after Windows is available; this cannot attest what is installed without being executed on that computer.

## Safe acceptance/release order

1. Keep production/cloud fallback and V52 guardian portal untouched.
2. Verify a private encrypted PostgreSQL 17 backup, and rehearse restore to disposable cloned database.
3. Resolve **every** posted payment to a verified immutable receipt identity; the mismatch cannot be guessed or overwritten. Obtain Director sign-off before any sync.
4. Reconcile actual local source changes and V52 custom guardian features against V50 draft. Install only reviewed module changes on an isolated test copy.
5. Test year changes and manual learner-by-learner advancement without changing live learners.
6. Run security review for LAN authentication, kiosk, staff and guardian RBAC, API parity, 58/80mm receipts, offline multi-device interactions.
7. Re-check all five release gates with independent acceptance evidence; only then package signed EXE/APK and consider production rollout.

**No final installer for all modules, no new migrations on the working database, and no production deployment were performed by this audit.**
