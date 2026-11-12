# CORNHILL system consolidation and security audit — 12 November 2026

## Scope and baseline

- Repository: `My-school-management-software/cornhill-school`.
- Protected production baseline documented in the project handover: commit `f890af95b8a99187cf8a710d728db7d63a9fca77`.
- Integrated development baseline: `release/cornhill-integrated-20261112`, commit `a7752cf25476a0dceef765f6a6699115ee47de83`.
- The integrated release is 32 commits ahead of that production baseline and does not delete or replace the production branch.
- This audit branch is `audit/system-consolidation-hardening-20261112`.

## Application inventory

The integrated tree contains 12 root HTML pages, 21 web manifests, a shared service worker, shared navigation and appearance assets, and a School Services workspace.

Not every app URL is a separate implementation. The app isolation guard redirects the configured subdomains to canonical paths. Specialist destinations such as HR/payroll, learning resources, library, transport, welfare, visitor register, facilities and staff communications intentionally open distinct sections of `school-services.html`. The small `school-communications.html` file is a redirect wrapper. These are aliases, not independent data stores.

Consolidation rule:
- Keep the main school dashboard as the system of record.
- Keep one canonical learner, staff, payment, attendance and guardian record.
- Keep separate parent access and role-limited application routes.
- Route specialist tools into the canonical School Services workspace where the same workspace is already used.
- Do not merge the parent portal, public admissions, evidence capture, banking or records vault into an unrestricted staff session.

The new `tests/app-architecture-contract.test.cjs` checks local rewrite destinations, duplicate route sources, host-to-route mappings, service-workspace aliases, manifests and Bursar-only payment UI. A GitHub Actions workflow runs it with the existing receipt, Bursar-enrollment and staff-account regression tests.

## Database security snapshot — read-only checks

Live project: `yemhortbudwbcrzsoozk`.

- 116 public tables were found; all 116 have RLS enabled.
- No public table was found with RLS disabled.
- 29 RLS-enabled tables have no client-facing policies. The read-only check found no direct `anon` or `authenticated` SELECT, INSERT or UPDATE table grants on those tables. DELETE privileges must also be included in a complete grant inventory before closing this finding.
- 133 public `SECURITY DEFINER` functions were found. 131 set an empty search path. None is executable by `anon`; 73 are executable by `authenticated`.
- The authenticated-executable functions inspected referenced `auth.uid()` or a school/teacher role helper. This is a structural indicator, not proof that every branch of every function is correct.
- One authenticated function, `claim_evidence_capture_device`, still uses `search_path = public, auth, extensions`. Its body checks `auth.uid()`, active staff status, and a hashed pairing code, but it should be reviewed for conversion to an empty search path.
- The other non-empty-path function, `verify_cornhill_backup_scheduler_token`, is not executable by `authenticated`; it is a service-only scheduler check.
- Supabase advisors report 79 multiple-permissive-policy findings, 115 unindexed foreign keys, 71 unused indexes, one `pg_net` public-schema extension warning and disabled leaked-password protection.

A multiple-permissive-policy warning does not by itself prove a data leak. PostgreSQL combines permissive policies with OR semantics, so each policy group must be reviewed as a complete role/table/action contract. Do not delete policies simply to reduce an advisor count.

## Migration source reconciliation

- The integrated repository contains 232 files under `supabase/migrations/`.
- Two pairs of files have identical 14-digit filename prefixes: `20261108145500` and `20261108211000`.
- The live Supabase migration history contains 258 entries. Repository filenames and applied migration versions do not map one-to-one by simple prefix comparison.
- Do not rename, delete, reorder, or replay migrations automatically. Reconcile the SQL content and applied history by normalized migration name and checksum first. New migrations must be generated with the Supabase CLI and must use a new version.

## Financial access finding — release blocker

The dashboard uses `post_school_payment_complete` for the learner payment form. The live function checks `is_school_finance_operator()`. That helper currently admits:
- the `Admin` profile (the Director), and
- active non-teaching Staff whose job title is Main Bursar, Bursar, Deputy Bursar or School Bursar.

The older `20261111185000_bursar_payment_posting_director_reversal.sql` migration changes `post_school_payment`, but it does not replace `post_school_payment_complete`, which the dashboard actually calls. Consequently, the database still permits the Director to post a payment through the current RPC. Hiding a form alone is not sufficient security.

UI correction staged on this branch:
- Finance oversight remains visible to the Director.
- The learner collection desk and receipt issuance UI is restricted to Main/Deputy Bursar profiles.
- The payment submit handler checks the Bursar role again.
- The Director sees an explanation that payments and receipts are handled by the Bursar.

**Not yet complete:** the matching database migration must introduce a Bursar-only posting predicate and use it in both payment RPCs. Keep `is_school_finance_operator()` for approved financial read/oversight functions. Keep payment reversals, expense approvals, bank-withdrawal approvals and payroll approval under the Director's separate authority. Do not call this change production-secure until the database migration and negative tests are applied and verified.

## Other release gates

1. Review all 73 authenticated-executable SECURITY DEFINER functions; keep only intentional client RPCs, check each caller/role guard and retain empty search paths.
2. Review all 79 multiple-permissive-policy findings individually; check for unintended OR broadening.
3. Audit all exposed Storage buckets and signed URL expiry/session revocation rules across every app.
4. Add negative access tests for Director, Headteacher, DOS, Bursar, Deputy Bursar, class teacher, subject teacher, operational staff and guardian.
5. Test cross-app record ownership and delayed network responses after sign-out.
6. Reconcile Supabase migration history against repository migration files before any schema deployment.
7. Run all browser smoke tests on Android and desktop, then verify backup recovery and offline conflict handling.
8. Preview the integrated release and keep production unchanged until all required gates pass.
