# CORNHILL system-wide architecture and security review

**Review date:** 12 November 2026  
**Reviewed source:** `feat/cloudflare-r2-evidence-storage-20261112` at `3865e27cbcecc0c2f021da2e8bc2fa037beb4495`  
**Working remediation branch:** `feat/system-architecture-security-review-20261112`

## Scope and limitations

This review combines a recursive repository inventory, source inspection of the main dashboard and service hub, a read-only inspection of the connected Supabase schema/policies/grants, and the current Supabase security/performance advisors. It did not modify school records, test real learner or staff accounts, run a penetration test, or prove that the system is immune to attacks. A promise that software can never be hacked would not be honest; the goal is to reduce attack surface, enforce separation at the database/API layer, detect failures, and recover safely.

## Inventory and application structure

At the reviewed commit, the Git tree contained 401 files, including:
- 12 HTML entry pages.
- 20 JavaScript/TypeScript files, including shared browser helpers and Supabase Edge Functions.
- 246 SQL files across migrations, maintenance and tests.
- A main `index.html` dashboard of approximately 1.14 MB.
- A shared `school-services.html` workspace of approximately 131 KB.

The Vercel route map has 20 `/apps/*` entry paths. Several named apps deliberately open a specific workspace within the same `school-services.html` page (HR/payroll, learning, library, transport, welfare, notices, calendar, visitor register, facilities, provider setup, system health and staff feed). These are separate role-limited work areas, not necessarily duplicate systems or duplicate databases. They should remain distinct destinations where the workspace parameter/path is different.

The shared data rule is correct and should be preserved: Supabase is the system of record; satellite apps should refer to canonical learner, staff, finance and service record IDs. A route or hidden menu is not an authorisation boundary. Every database read/write and every privileged Edge Function must independently enforce the signed-in user's role, record ownership, job title and allowed action.

## Verified duplicate and remediation applied in this branch

The live `school_apps` registry contained 24 entries (23 active and one inactive). Two active records shared the exact same Staff Communications destination:
- `school-communications` — Staff Communications & Events.
- `staff-communication-hub` — Staff Communication Feed.

The App Centre previously rendered both rows as separate cards. This branch adds a shared URL-normalisation/deduplication helper and changes the launcher to display only active, unique destinations. It keeps the full registry available to the administrator so the duplicate can be reviewed or deactivated deliberately. It does not delete or alter either database row, and it does not remove distinct School Services workspaces.

## Static page consistency scan

A source-level scan of the main dashboard, School Services, Banking, Evidence Capture, Notifications, Records, Admissions, Parent/Guardian, Public School Website and the staff-communications launcher found no duplicate HTML element IDs. This is a useful structural check, not proof that every page interaction is correct. Repeated `data-tab` values in the dashboard correspond to navigation and intentional “back to dashboard” controls (plus CSS selectors); they are not duplicate record forms. The only confirmed duplicate App Centre destination is the pair recorded above.

## Database security snapshot

Read-only inspection confirmed:
- Row-level security is enabled on the inspected public tables.
- The Security Advisor reports 29 RLS-enabled tables with no RLS policies. A follow-up grant check found no `anon` or `authenticated` table privileges on those 29 relations. They appear to be deliberately service-only/private tables; they should not receive client policies merely to silence an informational warning.
- The public schema contains 133 `SECURITY DEFINER` functions. All 133 currently have a fixed `search_path`; none of the inspected functions is executable by `anon`. 73 are executable by `authenticated`. This is not proof that 73 functions are vulnerabilities: some are intended role-gated RPCs. Each exposed function still needs body-level review for authentication, ownership checks, job-title scope, input validation and audit behaviour.
- Supabase Security Advisor reports 79 multiple-permissive-policy warnings. PostgreSQL combines permissive policies with OR, so every warning must be checked for unintended privilege widening. Some pairs are deliberate (for example, administrator plus assigned-teacher access); the list must not be bulk-deleted.
- Leaked-password protection is currently disabled in Supabase Auth.
- `pg_net` is installed in the `public` schema.
- Performance Advisor reports 115 foreign keys without covering indexes, 71 unused indexes and the same 79 multiple-permissive-policy warnings.
- The Supabase Health Advisor returned zero health lints during this check.

These are advisor findings, not a penetration-test result. Remediation must be one policy/function at a time with allowed-role and denied-role regression tests. Do not revoke all `SECURITY DEFINER` functions or add broad policies just to make the advisor count fall.

### Anonymous and shared-directory grant check

A separate inspection of `information_schema.role_table_grants` and the matching RLS policies found:
- No anonymous (`anon`) SELECT grant on learner, staff, payment, allocation, payroll, guardian, welfare, bank or attendance tables.
- The only anonymous table privilege in the checked public schema was INSERT on `school_admission_enquiries`, paired with a restrictive policy that permits a pending enquiry submission with review fields unset. Anonymous SELECT was not granted on that table.
- `class_login_directory` has an RLS SELECT policy whose role list includes `anon` and `authenticated`, but there is no `anon` SELECT table grant. Authenticated users do have SELECT access. Its inspected columns are class key/label, teacher display name, ordering and administrator display name—not a password or PIN column. The policy name is broader than the effective privilege; consider narrowing the policy to `authenticated` in a tested migration for clarity and defence in depth.
- The checked finance and staff-sensitive tables have RLS enabled and no anonymous table grants.

This is a metadata/grant review, not a test against every HTTP endpoint or every exposed view. Continue checking views, storage buckets, Edge Functions and RPCs separately.

## Current role and workflow findings

The live account totals returned by the role-count query were 1 Admin, 2 Staff and 10 Teachers. No names, contact details or individual records are included here.

The code and current policies show a sound basis for the following separation:

| Role | Primary responsibility | Must not receive by default |
|---|---|---|
| Director (Admin) | School-wide governance, admission approval, account/permission control, high-risk approvals, audited reversals and oversight | Routine cashier posting as the normal payment operator |
| Main Bursar | Learner fee lookup, payment posting, allocation, receipts, daily collections, deposit requests, expense requests and preparation of payroll | Approving own expenses/deposits/payroll, reversing receipts, changing marks or managing staff logins |
| Deputy Bursar | Delegated finance operations within explicit limits and audit rules | Director-only approvals and unrestricted account management |
| Headteacher | General school oversight, school operations and academic review within delegated scope | Routine finance posting, payroll approval and unrestricted user/security administration |
| DOS | Curriculum, assessments, marks review and academic/report-card workflow | Finance, payroll and staff account administration |
| Class/Subject Teacher | Only assigned class/subject teaching work and own staff information | Other classes/subjects, finance, payroll and school-wide private records |
| Operational staff | Only the facilities, gate, transport, library, welfare or other duty assigned to that account | Unrelated learner, finance, academic or staff records |
| Parent/Guardian | Separate guardian portal and only explicitly linked learner information | Staff/admin workspace, other learners, class lists or internal records |

### Finance and payroll gaps requiring a controlled backend change

The current `is_school_finance_operator()` helper includes both Admin and the Bursar/Deputy Bursar job titles. The main dashboard uses it to reveal the Finance area, and the payment-posting RPC `post_school_payment_complete` also relies on it. As a result, the Director still qualifies as a learner-payment operator in the current backend, even though the desired operating model is for the Bursar to post normal learner payments and receipts.

The opposite gap exists for payroll: current payroll-period and payroll-item insert/update policies and browser handlers are Admin-only. The Bursar cannot yet prepare and administer payroll through the current interface.

The intended safe workflow is:
1. Bursar (or a specifically authorised Accountant capability, if the school assigns one) prepares salary agreements, payroll period and proposed amounts.
2. Director reviews and approves the payroll period, with actor/time and a recorded decision.
3. Bursar records the actual salary payment only against an approved payroll line.
4. Existing payroll expense and advance-recovery triggers remain atomic and are tested against duplicate submission.
5. No user can approve their own payroll batch, approve their own expense request or reverse their own learner receipt.

This requires coordinated changes to RPC guards, table RLS, column privileges, UI controls, audit events and acceptance tests. Moving/hiding the Finance or Payroll buttons alone would be insecure. It is intentionally recorded as a next implementation phase, not changed by this App Centre deduplication patch.

### Admissions ownership

Keep one canonical admissions path: public enquiry → Director/Admin review → existing learner registration form → central `students.id` created once → enquiry linked to that learner. The Bursar should receive the approved learner for fee setup/charges only after the admission is accepted. The Headteacher may provide an academic/operational recommendation if delegated, but should not create a parallel admissions register.

## Stability and maintainability priorities

1. **Keep one source of truth.** Do not create separate learners, staff, payments, payroll, attendance or guardian records inside each app. Pass canonical record IDs through authenticated navigation and re-check access at the destination.
2. **Reduce the main dashboard monolith safely.** `index.html` is over 1.14 MB. Extract one cohesive module at a time into tested helpers/modules; do not replace the dashboard in one large rewrite. Keep startup dependencies explicit and lazy-load secondary workspaces where practical.
3. **Make shared services dependable.** Standardise account/session lifecycle, navigation, error reporting, offline status, file access, notifications and audit events. Cross-app links should carry only safe record context; the receiving app must authenticate and re-authorise.
4. **Prevent inconsistent writes.** Keep money-changing operations atomic in guarded database functions. Use unique constraints/idempotency keys for imports and payments, and optimistic concurrency checks for status changes.
5. **Protect offline operation.** Cache application shells and only the minimum explicitly approved encrypted drafts. Never treat cached data or cached role flags as authority for a fresh financial, academic publication or identity operation.
6. **Add release gates.** Run the automated suite, SQL role contracts, app-route checks, duplicate-route checks, JavaScript parse checks, and negative permission tests before promoting a preview. Keep backup restore and browser/device acceptance separate from static tests.

## Prioritised remediation plan

| Priority | Work | Release condition |
|---|---|---|
| P0 | Remove duplicate App Centre cards while preserving admin registry entries (implemented in this branch) | Automated duplicate/inactive/unique-workspace tests pass |
| P0 | Split Director oversight from Bursar payment posting; stage payroll preparer/approver/payer separation | DB role contracts prove allowed and denied actions for every role |
| P1 | Audit every authenticated-callable `SECURITY DEFINER` function and all permissive-policy overlaps | Function-by-function decision record and negative RPC tests |
| P1 | Enable leaked-password protection and move `pg_net` only after compatible integrations are confirmed | Auth/login and scheduled-job smoke tests pass |
| P1 | Review high-value foreign-key indexes against actual query plans; do not drop unused indexes blindly | Before/after query plans and latency checks |
| P2 | Extract the main dashboard and service hub into smaller modules with explicit dependencies | Existing regression suite remains green at every extraction |
| P2 | Reconcile App Centre and route registry so each app has one canonical label, destination and role/job-title scope | Every launcher route resolves to the intended workspace and denied roles remain blocked |
| P2 | Add monitoring for Edge Function errors, backup freshness, storage use, database capacity and failed sign-in spikes | Alerts and recovery procedure demonstrated |

## Release decision

This branch is a development remediation branch. The App Centre deduplication is a small, additive front-end improvement; no database rows or live school records were changed. The Director/Bursar/payroll changes and database-wide security remediations remain staged priorities until the required role regression tests and acceptance checks are completed. Do not describe the system as production-secure or immune to hacking based on static review alone.
