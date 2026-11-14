# CORNHILL Local Finance Foundation — Batch 14

## Added to the local-only migration branch
- Seven standard fee catalogue items: tuition, bursary, boarding, breakfast, lunch, graduation and other school payments.
- Learner fee obligations linked to a specific academic term, including separate previous-term and current-term balances.
- Bursary safeguards: bursary learners cannot receive the standard tuition obligation; the bursary charge must match the amount recorded on the learner admission profile.
- UGX-only payment records with cash, mobile money, bank transfer, card and cheque methods; mobile money identifies MTN or Airtel.
- Idempotency keys and external reference uniqueness to reduce duplicate payment posting.
- Payment allocations that can split one payment across multiple fee obligations, including previous-term debt and current fees.
- Posting checks require allocations to equal the payment amount and prevent aggregate allocations from exceeding the fee obligation.
- Automatically issued `CR-YYYY-NNNNNNN` receipt number and immutable receipt snapshot containing learner name, permanent pupil code, payment details, allocations and post-payment balances.
- Receipt snapshot protection and payment-detail immutability after posting.
- Fee obligation balance view uses PostgreSQL `security_invoker=true` and reports posted payments, balances and overdue status.
- SMS notification outbox only queues messages for guardian contacts that explicitly opted in. It does not send messages or connect to an SMS provider.
- Five additional finance permission codes; no role receives automatic finance access.

## Integration verification
- CI applies all seven migrations to a disposable PostgreSQL 17 database and verifies they can be applied again with matching checksums.
- Windows unit tests and Linux/PostgreSQL integration checks pass.
- Finance integration tests create a previous-term balance and current-term charge, post one split payment, and verify the generated receipt and remaining balances.
- CI verifies bursary tuition restrictions, cross-learner allocation rejection, overpayment rejection, posted-payment immutability, receipt immutability and consent-only notification queueing.
- The current test data is synthetic and rolled back at the end of verification.

## Not yet implemented
- Finance API routes, bursar screens, fee schedules by class, payment entry UI, thermal-printer receipt layout and reprint workflow.
- Full chart of accounts, expense approvals, bank deposits/reconciliation, payroll and financial statements.
- MTN/Airtel SMS provider integration. The outbox is only a safe queue foundation.
- Role permission matrix remains empty pending school leadership approval.
- No real learner, guardian, fee or payment records have been imported.
- No live Vercel or Supabase resources have been changed; the live school app remains on its current hosted backend.