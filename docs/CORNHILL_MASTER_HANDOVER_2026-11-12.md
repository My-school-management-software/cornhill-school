# CORNHILL Master Project Handover — 12 November 2026

This document is the continuity record for the CORNHILL NURSERY AND PRIMARY SCHOOL Management System. It must be read before further implementation, testing, merges, migrations or deployment. It records decisions already made so later work does not regress to an older branch or repeat completed tasks.

## 1. Live production baseline — verified 12 November 2026

- Permanent application: https://cornhill-school-swart.vercel.app
- Vercel project: `cornhill-school`
- Production deployment: `dpl_5pufcYDLLcg9MYK2SfuPKb8qs8Rg`
- Deployment state: `READY`, target `production`, no alias error.
- Source repository: `My-school-management-software/cornhill-school`
- Live source branch: `feat/role-based-staff-access-subject-teachers-20261111`
- Live application commit: `f890af95b8a99187cf8a710d728db7d63a9fca77`
- The permanent main address and 20 related CORNHILL module addresses were verified against this deployment and now point to the same release.
- Production Supabase project: `yemhortbudwbcrzsoozk`. Keep using this project's existing live data. Do not create a fresh database or seed a replacement database.
- Never deploy `feat/unified-staff-account-architecture-20261111` over the live application as a whole: it is an older/divergent staff-account branch and does not contain the restored afternoon/evening UI. Do not wholesale merge PR #13; GitHub reported conflicts.
- The live release was built from the role-based branch, not the stale staff-only branch. A previous wrong-branch deployment caused the compact header, page spacing, expanded content width and document studio to disappear. Do not repeat that regression.

### Production assets restored in the live build

- Compact top header and navigation controls, with navigation beside refresh/sign-out.
- Main content width expanded toward screen edges and vertical/header spacing reduced for a denser but readable workspace.
- Theme, mobile workspace and crest refinements.
- `assets/cornhill-document-template-studio.js`: visual report-card and receipt template studio.
- `assets/cornhill-navigation.js`: shared navigation.
- `assets/cornhill-headteacher-stamp.jpg` and `assets/cornhill-school-stamp.jpg`: official school and Headteacher stamps.
- Updated service worker, shell cache version `cornhill-shell-v98`.
- Report-card class review/approval/publication workflow code and migration.
- Leadership-to-teacher communications and subject-teacher learning-resource permissions.
- Bursar payment posting through guarded finance RPCs; payment reversals remain Director-only; direct expense-posting bypass removed.

## 2. Report-card and receipt templates — exact count and meaning

The Template Studio generates a catalogue of **50 report-card designs for every one of 10 classes**, i.e. **500 report-card design options in total**:
- Baby, Middle, Top
- P1, P2, P3, P4, P5, P6, P7

It also generates **50 receipt design options**. There are four template families: nursery, lower primary, upper primary and receipts. Families include five theme palettes, five layout approaches, font choices and section/motif variations. Receipt widths are 58mm and 80mm.

Important distinction:
- The 500 report-card options and 50 receipt options are generated in the frontend template catalogue. They are not 550 separate database rows.
- Production database verification confirms **10 saved report-card settings rows** (one per class) and **1 saved receipt settings row** in `public.school_document_template_settings`.
- The stored rows contain each class's selected template/settings. The studio loads and saves these settings through Supabase so preferences are shared across signed-in devices.
- The current saved defaults include the current CORNHILL/classic layout and signature visibility. Do not reset these preferences when modifying the studio.
- The Headteacher/school stamp artwork and generated fees are part of the report-card rendering work. Preserve dates, stamp placement, signature spaces, class-level settings and output consistency when changing templates.

## 3. Accounts and authority — binding user decisions

The Director's existing main account is the sole full-access Director identity. Do not create a second Director account, do not turn the Director login into a shared administrator login, and do not give the Director's main credentials or PIN to other staff.

Every other office-holder must have an independent, named identity/account, similar to the one-person-per-teacher model. The login screen must make those identities/roles visibly separate rather than show one generic administrator account that all school leaders share.

Required separate account holders:
- Headteacher — own account and own individual access code/PIN.
- Deputy Headteacher — own account and own individual access code/PIN (same individual-account principle; confirm any method difference only if the Director specifies it).
- Director of Studies (DOS) — own account. The user has mentioned both an individual code and email/password for the DOS in the same discussion; this is a genuine credential-method conflict and must be resolved in the next design checkpoint. Never silently make a shared account or invent an email/password.
- Main Bursar / School Bursar — own private email and password.
- Deputy Bursar — own private email and password.
- Teachers remain one account per teacher. A teacher teaching more than one class/subject must not receive multiple identities.

Director account and instruction flow:
- The existing Director/main account remains the authority for full school administration, account invitations/provisioning, role assignment, sensitive approvals and official instructions.
- Leadership/finance accounts report information and work activity into the Director's authorised oversight/notification area.
- Official school-wide instructions and high-authority approvals are issued/controlled through the Director's main account.
- Other leaders can be called administrators in the user interface as office-holders, but **must not be assigned the unrestricted backend `Admin` security role** if that would grant the Director's full privileges. Use each person's own authenticated identity plus least-privilege role/job-title policies.
- The existing database has a unique index intended to keep one active `Admin` identity (the Director). Preserve it.

### Current account implementation status — not yet complete

Production audit on 12 November found:
- 1 active `Admin` profile (the existing Director identity).
- 10 `Teacher` profiles.
- 0 active `Staff` profiles.
- Six employee-directory records exist (including Cook, Deputy School Bursar, Director, Matron, School Bursar and Security Guard); no Headteacher or DOS employee row was found in the audited directory.
- None of those six employee rows was linked to an account at the audit point.
- No Headteacher, Deputy Headteacher, DOS, Main Bursar or Deputy Bursar staff login was provisioned by these changes. No fictitious identities, addresses or passwords have been created.

The live login UI still has one generic `School staff sign in` email/password form, plus a separate Director/Main account form and individual Teacher sign-in. That generic School Staff panel technically authenticates a distinct user by email, but it does not give each school office-holder the distinct role tile/flow the user requested. This is a known outstanding defect, not a completed feature.

### Account UI and security work still required

- Replace the single generic School Staff sign-in entry with separate, clearly labelled role choices/flows for Headteacher, Deputy Headteacher, DOS, Main Bursar and Deputy Bursar. Do not publicly expose emails or list private staff identities unnecessarily.
- Each person must authenticate against their own Supabase Auth user/profile and verified employment record. Do not let a role tile bypass authentication or act as authorization by itself.
- Implement individual codes for the roles assigned code sign-in. A code must be unique to the employee, securely verified server-side, stored hashed (never plaintext), rate-limited and revocable. A common class code or shared office PIN is not acceptable.
- Bursars use their own email and password. The Director's existing main account/credential/PIN arrangement remains Director-only. Resolve the DOS code-versus-email/password ambiguity before shipping the final DOS credential form.
- Keep the individual security role/job title in the authenticated profile. Enforce permissions in server-side database policies/RPCs/Edge Functions, not just by hiding tabs.
- Invitation/provisioning is Director-managed, tied to an existing employee row and a real verified email when email/password login is required. Do not invent emails or create an account for an unverified employee.
- Avoid duplicate user identities. If an employee already has an account, link/update that identity rather than invite another.

## 4. Role/permission rules already present in application code

The current role-aware frontend helpers recognise:
- DOS by job title (Director of Studies, Director of Studies (DOS), DOS).
- Headteacher by job title (Headteacher / Head Teacher).
- Finance operators include the Admin/Director plus Staff whose job titles are Bursar, School Bursar, Main Bursar, Deputy Bursar or Deputy School Bursar.
- Headteacher is an academic viewer; DOS is an academic viewer and manager within the configured permissions.
- Teachers' learning resources are scoped to the teacher's actual class/subject assignments.
- Payment posting is delegated to permitted finance operators, while reversals remain Director-only.
- The Director remains the unrestricted Admin. Do not weaken this boundary for convenience.

The role-specific database migrations are live (see §6), but the new staff role accounts do not yet exist; role policy code does not mean those accounts have been provisioned or end-to-end tested.

## 5. Core school requirements to preserve

### Learners and admission
- Every learner receives an automatically generated unique permanent pupil/admission code at admission. That code remains with the learner until they leave.
- Include the Ministry of Education LIN for all classes.
- Payments and learner records must be searchable by pupil code or learner name.
- Keep a visible position for admission-generated pupil codes in class records.
- Support bursary status at admission and an individually recorded bursary fee/amount owed.

### Classes and assessment structure
- Nursery: Baby, Middle, Top. Include pupil counts/numbers and Language Development, Reading, Health Habits, Social Development, Writing and Drawing.
- P1–P3: English, Mathematics, Literacy I, Literacy II, Local Language, Religious Education, Total Marks and Position, plus pupil count and LIN/code.
- P4–P7: English, Mathematics, Science, Social Studies, Total Marks, Total Aggregate, Division and Position, plus pupil count and LIN/code.
- P7 additionally needs Index Number.
- Teacher phone workflow: each teacher can enter marks for assigned classes/subjects and inspect results/report-card errors within their permission scope.
- Academic review workflow: class report cards can be submitted for review, DOS/Headteacher approvals are recorded, publishing is controlled and published marks are protected against unintended edits. The Director retains the higher authority/reopen/override pathway where configured.

### Finance, fees and receipts
- Use UGX throughout.
- Support ordinary fees, bursaries, graduation and other school charges, and wider school finance/accounting.
- Bursary learners owe their recorded bursary amount; record payments and balances and issue receipts.
- Prompt for previous-term arrears on each payment. Let the operator allocate part/all to previous debt and/or current term, skip arrears when appropriate, and display allocations and remaining balances on the receipt.
- Search by learner name or pupil code.
- Support portable thermal printers and 58mm/80mm receipt layouts.
- Parent payment notifications by phone are a requested feature; MTN/Airtel coverage and provider configuration must be verified before claiming delivery is live.

### Parent/guardian portal
- Parent portal is strictly isolated from the school administration system, staff lists, class lists, internal records and secrets.
- Parent access is limited to the specific learner(s) and approved guardian(s), using permanent pupil code plus a second factor (registered guardian phone OTP or parent PIN).
- Parent portal shows only approved learner-specific information. Keep guardian contact sync and PIN/OTP controls restricted and audited.

### Staff, attendance and communication
- Staff have individual identities and access permissions according to job title.
- Include the Director, Headteacher, Deputy Headteacher, DOS, Main Bursar, Deputy Bursar, cooks, Matron, Patron, Senior Woman, Senior Man, Store Managers, class teachers by class, upper-primary section teacher (P5–P7), lower-primary section teacher (P1–P4), Nursery Head and other approved positions.
- Staff attendance design is inspired by basic Jibble-style attendance concepts but must be implemented natively; do not add Jibble itself. The proposed hardware is one local fingerprint terminal connected to the main office computer (about 30 staff anticipated). Confirm model, driver/SDK and supported integration before claiming hardware is operational.
- Staff communication includes official messages/announcements. Short video/reel-style content was a requested possibility and must be assessed for safe, practical storage/bandwidth support before implementation.

### Platform, offline and cost
- Must work on Windows 10/11 and Android, across more than 10 school computers, with designed access restrictions.
- Online/offline operation is required, but do not describe it as full offline sign-in/synchronisation until the device-bound credential and sync path are fully implemented and tested.
- Current offline class-list snapshot is encrypted, owner-bound, read-only and expires after 12 hours. Finance, guardian data and live updates are unavailable offline. This is not full offline functionality.
- Respect the user's no-paid-plan constraint. Do not enable paid Vercel/Supabase/GitHub features, paid add-ons or billing upgrades without explicit permission.

### User interface preferences
- Preserve the compact, professional main header and navigation, adjusted spacing and wider content area from the afternoon/evening work.
- More than seven themes and more than 20 font styles were requested, including some animated theme options. Do not regress appearance settings while editing login or reports.
- Keep role selection compact and readable on Android; no oversized or crowded login window.

## 6. Production database migration and verification record

Production migration ledger on 12 November includes these deployed changes (actual Supabase migration versions are generated by Supabase and recorded here):
- `20261111212708 unified_staff_account_directory`
- `20261111212712 require_active_staff_session_for_staff_tables`
- `20261111212716 fail_closed_active_staff_session`
- `20261111212721 fail_closed_role_and_teacher_helpers`
- `20261111212725 remove_null_active_fallbacks_from_staff_rpcs`
- `20261111222238 bursar_payment_posting_director_reversal`
- `20261111222242 subject_teacher_learning_resources`
- `20261111222247 staff_leadership_teacher_communication`
- `20261111222252 report_card_class_review_workflow`
- Earlier live entries include `20261111141045 class_specific_report_card_template_settings` and `20261111063932 school_document_template_settings_20261111`.

Report-card workflow schema objects created by the workflow migration:
- Tables: `public.report_card_review_workflows`, `public.report_card_review_events`.
- Functions: `report_card_class_review_snapshot`, `guard_published_report_card_assessments`, `guard_published_report_card_scores`, `submit_report_card_class_for_review`, `review_report_card_class_as_dos`, `review_report_card_class_as_headteacher`, `publish_report_card_class`, `reopen_report_card_class`.

Verification snapshot:
- 10 report-card settings rows, 1 receipt settings row.
- 0 report-card review workflow records and 0 review event records at the audit time: schema/functions exist but a live approval cycle has not yet been exercised.
- 1 active Director/Admin profile, 10 Teacher profiles, 0 active Staff profiles at the account audit.
- Staff account security migrations created the staff account directory view and fail-closed active-session protection policies. Do not remove these controls.
- Edge Functions `staff-invite` and `staff-employment-status` were deployed in the preceding work. The invitation path checks the authenticated actor as Admin and ties invitation to an existing unlinked active employee. Do not invoke invitations without confirmed real employee details/email.
- No real staff invitations or non-teacher account creation were carried out in the recorded work.

## 7. Tests and known gaps

At commit `f890af95b8a99187cf8a710d728db7d63a9fca77`, the two GitHub Actions suites reported success:
- CORNHILL marks import mapping tests.
- CORNHILL appearance and workspace tests.

The report-card review workflow test file is present in the latest commit. The production Vercel deployment is READY on the latest commit and all 21 project aliases were assigned with no alias error.

Do not overstate these results:
- No real Headteacher/DOS/Bursar account sign-in E2E test has been completed because those users are not provisioned.
- No complete report-card submit → DOS review → Headteacher review → publish → reopen cycle has been exercised with real authorised accounts.
- No real finance payment/reversal E2E has been reported in this checkpoint.
- No actual fingerprint device integration has been verified.
- No offline PIN/password sign-in and synchronisation E2E has been completed.
- SMS delivery providers and credentials have not been configured/verified here.

## 8. Required next development batch — do not skip or restart from old work

1. Read this handover and inspect the current production commit before editing.
2. Implement a distinct role-based sign-in screen with separate account choices for Headteacher, Deputy Headteacher, DOS, Main Bursar, Deputy Bursar and the existing Director main account. Teachers remain individually listed/selected via the teacher workspace. Keep the UI compact on Android.
3. Preserve Director-only full Admin role; use least-privilege per-office access for all other accounts. Never create another Director identity.
4. Resolve the DOS authentication-method ambiguity (individual code versus private email/password) before releasing the form. Headteacher/Deputy Headteacher individual code sign-in and bursar email/password are the currently clear requirements.
5. Check/create the missing employee directory records for Headteacher, Deputy Headteacher and DOS using school-confirmed details; do not invent names/emails. Link existing bursar employee rows to their own new accounts only after real official email addresses are confirmed.
6. Build secure, individually revocable code authentication if code-based sign-in is selected. Hash codes, enforce rate limits, expire/revoke them, bind to a single employee, and ensure the successful login obtains a genuine Supabase Auth session. Never store or compare plaintext PINs in the browser.
7. Verify leadership/bursar role permissions and Director oversight/instruction routing through the database, not merely the UI.
8. Execute grouped regression batches (the user prefers approximately 20 related tests per cycle, and larger batches when practical). Report pass/fail/blocked counts, not just a general statement.
9. End-to-end test each role separately, report card workflow, payment posting/reversal, template save/load, mobile layout, offline boundaries and parent portal isolation.
10. Update this document whenever requirements, implementation, deployment or test status changes. Deploy only from the integrated current source branch after the test gates pass. Verify the permanent domain's exact commit SHA after each production release.

## 9. Working rules for future sessions

- Work from the live release branch and this handover. Never start from an older branch just because it has fewer merge conflicts.
- Preserve completed afternoon/evening work: compact header, reduced spacing, expanded width, Template Studio, class-specific settings, official stamps, report-card review workflow, leadership communication and finance controls.
- Do not ask the user to repeat requirements already in this document.
- Do not claim a database migration, feature, account, test, or deployment is complete unless its result is verified.
- The project must accumulate improvements. Avoid replacing completed work with a demo, a simplified shell, a stale preview or an old branch.
- No staff credentials, passwords, private emails, PINs or phone numbers belong in this document or public login markup.


## Sign-in separation checkpoint — 12 November 2026

### Requested account structure
- The existing Director/Main account remains the one and only `Admin` identity and stays on its original, separate sign-in form. No extra Director account is created.
- Teaching staff retain one Auth identity per real teacher. The main dashboard now offers a personal access-code + account-password route by default, with an email/password alternative. The selected class/subject assignment is still checked by `teacher_list_my_assignments` after authentication.
- Headteacher and Deputy Headteacher have separate role choices and use their own personal access code plus their own account password.
- DOS has a separate identity and can use a personal access code plus password, or email/password for that same DOS account.
- Main Bursar and Deputy Bursar each have a separate role choice and use their own private email/password.
- Other non-teaching employees use individual email/password identities and narrowly assigned permissions.
- Role choice is not authorization. After successful authentication, the dashboard checks the signed-in profile's role, job title and active employment status. Database RLS and guarded RPCs remain the actual enforcement layer.

### Files and implementation committed on the development branch
- `index.html`: the live dashboard's former shared "School staff sign in" form has been replaced with distinct Headteacher, Deputy Headteacher, DOS, Main Bursar, Deputy Bursar and Other Staff account choices. The Teacher class selector and Director/Main account panel are retained.
- `school-services.html`: the standalone services sign-in now offers the same separate role choices and validates the chosen role after authentication. The Director-only Individual Staff Access Codes panel is available to issue/reset/revoke codes for existing eligible accounts.
- `supabase/functions/staff-access-code/index.ts`: individual access-code login and Director-only issue/revoke actions. Codes are randomly generated, HMAC-hashed on the server, never queryable from the browser, and only usable together with that account's password. Code lookup verifies the active linked employee and exact role/job title. Login attempts are rate-limited; issuance, revocation and use are audited.
- `supabase/migrations/20261112020000_individual_staff_access_codes.sql`: private code, rate-limit and audit tables, with RLS and client-role access revoked. The rate-limit RPC uses SECURITY INVOKER and is executable only by service_role.
- `tests/staff-access-login-contract.test.cjs` and `.github/workflows/staff-access-tests.yml`: tests for the role choices, main-dashboard login paths, account-role matching, Director-only code management, code issuance route and preservation of teacher assignment and Director checks.

### Verification and release status at this checkpoint
- Main dashboard source was retrieved from the live site and its original Git blob SHA matched the feature-branch `index.html` before editing. The updated dashboard file was committed using Git's blob/tree/commit path (the file is over 1 MB).
- Both GitHub Actions suites passed on development commit `48e740d22dfbf199d8105f0771f891fd49e42d0e`: CORNHILL individual staff access tests and CORNHILL appearance/workspace tests.
- **This is not yet deployed to production.** The production website still serves the previous release at commit `f890af95b8a99187cf8a710d728db7d63a9fca77`. The production migration `20261112020000_individual_staff_access_codes` has not been applied, and the `staff-access-code` Edge Function has not yet been deployed.
- The live database audit still showed 1 active Director/Admin profile, 10 active Teacher profiles and 0 active Staff profiles. No Headteacher, Deputy Headteacher, DOS or Bursar login has been created by this work. Existing employee directory records without confirmed individual emails must not be invited using invented addresses.
- Positive end-to-end sign-in testing against real leadership/bursar users is blocked until the Director confirms/creates their actual employee records and registered school email addresses. Code-based logins cannot succeed until a code is issued to that real linked account.
- Once production migration/function and frontend release are complete, the Director must issue individual codes to the relevant active Teacher, Headteacher, Deputy Headteacher and DOS accounts. Bursars must each accept their own email invitation and set their own passwords.

### Next actions — continue from this checkpoint
1. Final-check PR #14 and its test results, then merge the role sign-in change into the current production source branch without reverting the compact header, expanded content area, report-card studio, stamps or review workflow.
2. Apply the additive individual-access-code migration to the existing production Supabase project only after final source review; deploy `staff-access-code` with handler-level authentication (the pre-auth sign-in endpoint requires platform JWT verification off, while issuance/revocation still independently validate a live Director bearer session).
3. Deploy the merged frontend to the permanent CORNHILL Vercel address; verify its exact commit SHA and the 21 existing app aliases before declaring release.
4. Have the Director confirm the real names/job titles/official school emails for Headteacher, Deputy Headteacher, DOS, Main Bursar and Deputy Bursar. Link existing employee rows rather than creating duplicates; send real invitations; issue individual codes only after those accounts are active and linked.
5. Run separate positive/negative login and permission tests for Director, each leadership role, each bursar, class teachers and subject-only teachers. Also test sign-out/session isolation on shared school computers and Android.

Do not describe the separate accounts as active until those real accounts exist. Do not change the Director's existing credentials or provision placeholder users.

---

## Release integration checkpoint — 12 November 2026, 08:53 UTC

This checkpoint supersedes any earlier deployment or release statements in the historical sections above where they conflict. The earlier dated entries are retained as history; use this section as the current operational baseline.

### Source control — merged and verified

- Integrated release branch: `release/cornhill-integrated-20261112`.
- Current integrated release commit: `b81479ea0a027373391d5d1f2a39d2c7a1cc472b`.
- Pull request #25 (Director-controlled bursar enrollment integrated into the existing release) is merged: https://github.com/My-school-management-software/cornhill-school/pull/25
- Merge commit message: `feat: add bursar enrollment to release`.
- The integration preserved the existing role-based sign-in and Settings/dashboard navigation rather than replacing the live shell with an older branch.
- The PR's bursar enrollment contract workflow succeeded: https://github.com/My-school-management-software/cornhill-school/actions/runs/43186048394

### Supabase production backend — deployed, but email setup remains blocked

- Production Supabase project remains `yemhortbudwbcrzsoozk`.
- Migration `20261112080000_bursar_account_enrollment` is applied.
- Edge Function `bursar-account-admin` is ACTIVE (version 1; JWT verification enabled).
- Edge Function `staff-invite` is ACTIVE (version 13; JWT verification enabled) and explicitly blocks bursar titles from the generic invitation path.
- Verification confirmed the enrollment and audit tables exist, RLS is enabled on both, and the server-only activation function exists. No enrollment rows were created.
- No real bursar account was invited or activated, and no staff invitation email was sent.
- Before real use, configure the exact allowed redirect URL `https://cornhill-school-swart.vercel.app/bursar-account.html`, configure a verified custom SMTP sender, and enable/test the project-level Password changed security notification. These Auth dashboard settings were not accessible through the connected management tools during this checkpoint.
- Test mail delivery with a designated test account before sending any real staff invitation. Do not invent staff emails.

### Vercel production — NOT updated to this release

- Permanent production address: https://cornhill-school-swart.vercel.app/
- Verified production deployment remains `dpl_AKKwsNgxR2WVtywcTjpfUvXXsG8m`, READY, with alias error null.
- Its source commit is still `a9f55fe1b796dd9190a21ae43dfdf7648ec11dc0` on `feat/role-based-staff-access-subject-teachers-20261111`.
- A deployment lookup filtered to release commit `b81479ea0a027373391d5d1f2a39d2c7a1cc472b` returned no deployment.
- GitHub's combined status for `b81479e` reports the Vercel check as failed with the Vercel build-rate-limit destination. The free deployment allowance is therefore still the blocker; do not upgrade or repeatedly retry while the limit is active.
- The latest READY deployment on the project at this checkpoint is a preview from a different, older handover commit `9d9addf761a063dece597b21af1c30ad7342fca1`. It is not production and must not be treated as the integrated release.
- Do not say the website or installed Android PWA contains PR #25 until the production deployment is READY, the permanent alias is attached, and the alias is verified against the exact release SHA. A separate APK, if one is used, requires its own build and distribution.

### Immediate next actions

1. After the Vercel free deployment allowance resets, make one carefully targeted production deployment from the integrated release commit `b81479ea0a027373391d5d1f2a39d2c7a1cc472b`; confirm the intended project, production target and commit before release.
2. After deployment, verify the permanent domain resolves to the exact commit, check the 21 existing module aliases, and run smoke tests on desktop and Android/PWA before telling the school to refresh/install the update.
3. Complete Supabase Auth redirect, SMTP and password-change notification configuration, then test mail delivery with a designated test account.
4. Only after the Director supplies confirmed active bursar employee records and official email addresses, test the invitation → email verification → Director approval → private password setup → activation flow. Never create placeholder staff accounts.
5. Continue the agreed grouped regression batches (about 20 related checks per cycle where practical), recording actual pass/fail/blocked counts. Do not call the full school system complete: finance, academic workflows, parent portal isolation, fingerprint attendance, SMS, and full offline sync still require their own end-to-end verification.

### Status language for the next handover

- **Merged in GitHub:** yes — PR #25 at `b81479e`.
- **Bursar backend deployed to Supabase:** yes — migration and Edge Functions verified.
- **Bursar invitation email configuration:** pending.
- **New integrated frontend deployed to production:** no — Vercel free build-rate-limit blocked it.
- **New integrated frontend available on the installed PWA:** not yet verified; do not claim it is updated.
- **Real bursar accounts or credentials created:** no.

---

## Individual staff access-code security checkpoint — 12 November 2026, 09:18 UTC

This is the latest access-code operational checkpoint and supersedes earlier statements above that the access-code migration/function had not been deployed.

### Supabase production deployment — verified

- Production project: `yemhortbudwbcrzsoozk`.
- Migration `individual_staff_access_codes` is present in the production migration ledger (actual recorded version: `20261112035651`).
- Edge Function `staff-access-code` is ACTIVE, **version 2**, with `verify_jwt=false`. The pre-authentication login action has no user session yet; the handler itself validates the bearer session and active Admin profile for Director-only `issue` and `revoke` actions. The login action validates role, active linked staff identity, access-code hash and the account password before returning a real Supabase Auth session.
- The deployed version-2 `index.ts` was retrieved and compared byte-for-byte with the merged release-branch source; the contents matched exactly.
- The function hardening in PR #27 now keys the rate-limit bucket to the connection IP hash (not browser user-agent) and checks security audit writes for issue, revoke, and successful-login actions. If issuance audit writing fails, the newly generated code is deactivated and is not returned. The Director revoke operation remains applied if its audit write fails, and the caller receives an error rather than a false success.
- Three access-code tables have RLS enabled. Browser roles `anon` and `authenticated` have no SELECT privilege; the server-only rate-limit RPC is executable only by `service_role`.

### Current account counts — no staff changes made

Production database audit at this checkpoint:
- Active Director/Admin profiles: 1.
- Active linked teacher accounts: 10.
- Active teacher accounts with a personal access code: 0.
- Access-code records: 0.
- Access-code audit events: 0.
- Active Headteacher, Deputy Headteacher and DOS employee records: 0.
- Active non-teaching Staff profiles: 0.

No access codes were issued, no staff invitation was sent and no account/password was created or changed during this checkpoint. The Director can issue codes only after selecting an eligible, active, linked staff account; the Director should personally issue the codes and deliver them privately to the correct staff members. Do not place codes in this document or in public records.

### GitHub source and test status

- PR #27 (access-code audit and throttling hardening) is merged: https://github.com/My-school-management-software/cornhill-school/pull/27
- Merge commit: `9090e0289cdf4e64d7315b8e4fe40313096ce983`.
- The individual staff access test run passed **13/13**, 0 failures: https://github.com/My-school-management-software/cornhill-school/actions/runs/43189939200
- The bursar enrollment contract test run passed; the appearance/workspace test run passed.
- The staff-access workflow was updated so pull requests into `release/cornhill-integrated-20261112` run the individual staff suite. This was necessary because the previous workflow only listed older target branches.

### Frontend and staff onboarding boundaries

- The production website is still on commit `a9f55fe1b796dd9190a21ae43dfdf7648ec11dc0`; the free Vercel build-rate limit is still blocking the new integrated frontend deployment.
- Therefore the current production website has not yet exposed the latest merged role-based login interface or PR #25 bursar onboarding page to users. The production Supabase backend being active does not mean the new login screens are live on the website.
- Do not tell teachers to use access-code sign-in until the frontend is deployed and their personal codes have been issued by the Director.
- Do not tell Headteacher, Deputy Headteacher or DOS to sign in until the school has added and verified their active employee records, linked their accounts, and issued credentials.
- Bursar account invitations still require the approved Auth redirect URL, a verified custom SMTP sender and tested password-change security notification before real invitations can be sent.
- No PWA update is confirmed until the permanent Vercel alias points at a READY deployment with the exact integrated release SHA.

### Next operational steps

1. When the free Vercel build quota becomes available, make one production deployment from the current integrated release branch and verify the permanent URL and 21 module aliases against the exact deployment SHA.
2. Run desktop and Android/PWA smoke tests against that exact deployed build before asking staff to refresh or reinstall.
3. After production frontend is live, have the Director issue codes individually to the existing eligible active linked teachers; separately provision leadership accounts only after the school confirms the records and identity details.
4. Complete Supabase Auth redirect and SMTP configuration, then test bursar email onboarding with a designated test address.
5. Continue grouped regression testing. No complete real-account multi-role E2E test has yet been completed for this checkpoint.
