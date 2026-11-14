# CORNHILL Local Bursar Screen — Batch 17

## Included

- Added a local Bursar web page at `/` and `/bursar` on the separate HTTPS server.
- The page contains staff sign-in, learner search, learner profile summary, term-by-term fee balances, optional prior-term allocation selection, payment method/provider, payer and collection item fields, UGX amount entry and receipt preview.
- Current-term and previous/other-term fee rows are labelled separately. Previous-term balances are not automatically selected; the Bursar explicitly chooses whether to clear them.
- Any amount received but not allocated is displayed as retained learner credit.
- Payment retries preserve the same payload and Idempotency-Key after a network failure, so a user retry cannot silently create a second payment.
- Receipt preview has a narrow 76mm print layout for browser printing. It has not yet been tested on a physical portable thermal printer.
- The UI uses only same-origin JavaScript/CSS and the existing authenticated HTTPS APIs. No third-party scripts, analytics, CDN fonts or public CORS are introduced.
- HTTPS serves only an exact allow-list of Bursar assets, checks the configured Host header, and sets a restrictive same-origin Content-Security-Policy.
- Health response reports whether the finance API runtime pool is actually enabled. The page does not offer a sign-in form for finance while that flag is false.

## Activation boundary

The installer still does not set passwords or enable LOGIN on either runtime role. Finance remains disabled while `CORNHILL_DB_FINANCE_RUNTIME_PASSWORD` is a placeholder. The local database role and HTTPS certificate prerequisites must be separately approved and verified before activating the page for real school transactions.

## Still pending

Physical thermal printer tests, reprint authorization, a receipt-copy audit action, later assignment of retained credit, expenses and approvals, bank statement reconciliation, SMS delivery and broader accounting are not included. The main school application, Android/LAN access, offline sync and hosted cutover remain separate work.
