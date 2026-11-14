# CORNHILL Local Finance — Audited Receipt Reprint Batch 18

## Implemented in the local-only branch

- Migration 012 adds `reprint_local_payment_receipt`, a SECURITY DEFINER function with a fixed search path.
- The function requires an active staff account, active employment and the separate `finance.receipts_reprint` permission. Possessing payment-entry permission alone is not enough.
- A valid original receipt number and a 5–300 character reason are required.
- The function locks the original receipt and payment rows, checks that the payment is Posted or Reversed, increments only the receipt's reprint-action metadata, and appends a `receipt.reprinted` finance audit event in the same transaction. The event records that the Bursar requested/displayed a reprint; it is not proof that a physical printer successfully produced paper.
- The immutable receipt snapshot, receipt number and issue date are never changed. A reversed payment may be reprinted as a historical copy with its reversed status shown separately.
- The finance API has a dedicated POST route; its authenticated staff actor comes from the session and not the request body.
- The Bursar page displays the reprint form only when the authenticated principal has the separate permission. Every reprint requires a recorded reason. Reprinted reversed payments are labelled.

## Verification added

- PostgreSQL integration verifier checks the function grant, a successful reprint, exact print-count update, unchanged receipt snapshot, audit reason and rejection cases for missing permission, invalid reason and missing receipt.
- HTTP tests check separate permission enforcement, authenticated staff identity, route, reason validation and no call to the repository when the staff user lacks permission.
- UI tests check the permission-gated reprint panel and reversed-copy label.
- CI is pending for this batch. Its tests must pass before the school is asked to pull or apply migrations.

## Boundaries

Migration 012 has not been applied to the school's Windows database. Runtime roles remain NOLOGIN, and the finance runtime password remains a placeholder in the example configuration. The local HTTPS finance service is not activated. Physical thermal-printer testing is still outstanding.
