# CORNHILL Local Finance — Authenticated Bursar API Batch 16

## What was added

- Migration 011 adds two SECURITY DEFINER read routines: learner search by pupil code/name and a learner finance-account snapshot containing term/item charges, amount paid and outstanding balance.
- Both read routines independently verify active staff employment and the explicit `finance.payments_record` permission.
- Finance API database access remains function-only. No direct table SELECT or receipt-sequence grants are added.
- Added a separate finance database runtime configuration and repository, using the dedicated `cornhill_finance_api` identity.
- Added HTTPS finance routes:
  - `GET /api/v1/finance/learners?search=...`
  - `GET /api/v1/finance/learners/:learnerId/account`
  - `POST /api/v1/finance/payments`
- Every route validates the secure staff session, role permission and request host. Payment POST also requires same-origin HTTPS, CSRF validation and a UUID Idempotency-Key. The acting staff ID is taken from the authenticated session, never the request body.
- Payment input checks method/provider, positive whole-UGX values, duplicate fee items and allocation totals before it reaches the existing atomic SQL posting function.
- Separate auth and finance pools are composed into the HTTPS route handler only when a private finance runtime credential is configured. The example environment file leaves finance disabled with a placeholder password.

## Verification added

- HTTP handler tests cover unauthenticated and non-finance users, HTTPS/host checks, learner search/account, same-origin and CSRF requirements, idempotency keys, MTN/Airtel, duplicated allocations, input limits and generic error handling.
- PostgreSQL finance verification checks search/account function privileges, performs a synthetic learner search and retrieves the term fee-account summary.
- Runtime config supports both native Windows PostgreSQL port 5432 and isolated CI port 54329 while remaining loopback-only.
- CI has not yet run this new batch. Do not treat its tests as passed until the resulting workflow completes successfully.

## Boundaries

The API is not enabled on the school's Windows database. Finance database roles remain NOLOGIN and the finance password is not provisioned by the installer. Batch 17 adds a separate Bursar page with sign-in, learner search, optional term allocation and browser-print receipt preview. Physical thermal printer testing, expenses, banking, SMS delivery and later unallocated-credit assignment remain pending. The hosted system and school records are unchanged.
