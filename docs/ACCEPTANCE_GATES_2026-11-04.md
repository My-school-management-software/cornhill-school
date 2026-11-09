# CORNHILL acceptance gates — 4 November 2026

This note records what was verified during the remaining-issues review. It deliberately separates source/database inspection from real device acceptance testing.

## Deployment
- Vercel preview for source commit `8c5cb90dea450c09f13bed24b0d15c0061bb6678` is READY.
- Preview URL: https://cornhill-school-6ua9dnjm5-cypher-projects1.vercel.app/
- The later documentation-only commit may not yet have its own deployment. The preview above contains the application code commit.

## Database and security review
- The Supabase project is ACTIVE_HEALTHY.
- There is no Supabase staging/development branch. Production migrations must not be treated as staging validation.
- Read-only counts at review time: learners 0; classes 0; staff profiles 1; inventory items 0; assessments 0; payments 0.
- Reviewed exposed SECURITY DEFINER functions. `admin_list_active_finance_students()` and `admin_list_students()` both reject anonymous callers and require `public.is_school_admin()`. `is_school_admin()` returns only whether the authenticated user's profile role is Admin. The three advisor findings are therefore intentional guarded RPCs, not grounds for blindly revoking EXECUTE.
- `queue_parent_payment_sms()` is trigger-only (not granted to authenticated users) and queues only posted payments where the guardian has opted in and a phone number exists.
- Supabase Auth breached/leaked-password protection is reported disabled. This setting must be enabled in the Supabase Auth dashboard before production use; no available connected action can safely change that Auth setting here.

## Offline behavior — verified source scope
- The page registers `/service-worker.js`.
- The active worker caches only the application shell (root page, index page, manifest and school icon) and serves the cached shell for offline navigation.
- Cross-origin requests and non-GET requests are not cached.
- The application has no IndexedDB implementation or durable offline operation queue. Learner records, marks, finance records and payments are not synchronized offline. Offline payment posting remains explicitly prohibited.
- Removed the unused older `sw.js` worker to avoid keeping two competing service-worker implementations in the repository.

## Browser and hardware acceptance gates
- Source-level JavaScript parsing and HTTP delivery checks are not equivalent to interactive browser tests.
- The preview is protected by team SSO. An authorized school administrator must test sign-in and role-based workflows in a real Windows/Android browser.
- Fingerprint integration cannot be completed or certified without the exact purchased device, firmware, export format/SDK and a real connection test. Do not store raw fingerprint images in the school database.
- Thermal receipt layout supports 58mm/80mm browser printing, but actual printer/Android driver output still requires a physical test.

## Safe completion sequence
1. Enable breached-password protection in Supabase Auth.
2. Create an isolated staging database only after confirming it is available at no cost; never use the live school database as a test environment.
3. Run authenticated browser acceptance with controlled test accounts and clearly marked test learners/payments, then remove test data through approved cleanup.
4. Design and test offline academic/administrative drafts with idempotent server reconciliation before enabling any offline financial workflow.
5. Integrate fingerprint attendance only against the school's exact device and vendor SDK/export documentation.

No paid plan, paid add-on, or paid external service was enabled as part of this review.
