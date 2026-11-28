# CORNHILL V70 — Learner Completion Centre, Advanced Requirements, and Guardian PIN Settings

Date: 28 November 2026. Director's explicit requirements added to development branch; **not a claim that working Windows software has been upgraded**.

## A. Learner Register: full completion workflow instead of an overwhelming table

The Director reports the local Learner Register is incomplete and wants every responsible member of staff to see **all relevant fields** and fill information that is missing.

The director supplied a very tall narrow screenshot (78px wide in the chat upload), too low-resolution to reliably verify which exact columns are currently visible. A prior source-only Windows snapshot (V63) confirms that the currently installed register table has learner code, LIN, P7 index, learner, gender, class, Day/Boarding, bursary (conditional), guardian/phone (conditional), status and action; the learner edit dialog covers only basic demographics, not full guardian/fees/requirements.

### Proposed view

- **Class register:** searchable and filterable by class/status/term and missing information; accessible columns with optional column chooser; completion summary badges, never invented counts.
- **Expand/View Learner:** one learner record split into tabs/cards: Identity, Admission & Enrolment, Parent & Guardian Contacts, School Fees & Receipts, Scholastic Requirements, Nursery Teacher Materials, Academics & Report Cards, Boarding & Meals, and Audited History. Staff should see only modules for which they have existing permissions.
- **Identity & admission:** permanent code (immutable), LIN, full name, gender, DOB, age (calculated), class, stream, academic year/term, admission date, learner type, previous school, P7 index where relevant, status and completion flags.
- **Parent/guardian:** name, relationship, phone (+256 format), alternative contact if authorised, status/verified contact, phone completeness, guardian account access status, masked PIN status metadata, opt-in consent as verified, edit/approve actions only for authorised roles. Do not expose another learner's guardian or let teachers update permission scope.
- **Fees:** current/previous term charges, combined outstanding, amount paid and receipts **read from Finance authoritative services**. Do not let an ordinary learner-profile edit create or change fees, receipts, ledgers or allocations. Bursary reason/category visible/editable only for approved role.
- **Scholastic materials & advanced school requirements:** versioned class/term requirements with item, units, target, learner delivered, outstanding, received/verified by/time, teacher issued/used/returned and available **per learner**; handovers and class-wide lists separate; special requirements/waivers documented and authorised; print individual and class summaries. When teacher custody has not been activated show **Not yet recorded** rather than false zeros. Nursery teachers can see only assigned classes.
- **Completion status:** Missing LIN, incomplete guardian contact, unknown phone, unconfigured fees, materials not submitted or only partly received, assessment missing, etc. Blank values mean “Not recorded” not zero. Each card has a permission-gated “Complete / Edit” button. Show who updated a field and when.
- **Office/Director oversight:** permitted summary counts by class, completion %, staff work queue, read-only audit log. No mass data overwrite from unverified backups.
- **Windows/Android:** phone-friendly single-learner cards, desktop table with optional columns, sticky headers for long tables, A4 printing and no overlaid toolbar.

### Correct data ownership

| Data | Authoritative source | Editing authority |
| --- | --- | --- |
| Learner identity and admission | School Office/admissions | Director, authorised admissions |
| Contact/guardian PIN status | Guardian contacts and protected access service | Guardian staff approval; parent self-service PIN |
| School fees, bursary and receipts | Finance ledger and approved fee schedules | Authorised Bursar/Director only |
| Required and delivered school materials | School Requirements per learner | School Office and authorised requirements staff |
| Teacher-issued Nursery materials | Approved learner-custody ledger (not yet live) | Assigned teacher + school permissions |
| Academics and progression | Academics/history | Authorised teachers / academic officers |

Do not show fields the user's permissions do not allow; never reveal finance/guardian data merely by widening the table.

## B. Guardian PIN lifecycle

### Initial issuance (existing backend)

- The school verifies the registered guardian and contact number.
- **An authorised Director/staff officer clicks Issue PIN & Approve** in Parent Access & Guardian PINs, causing the server to generate a random 8-digit initial PIN.
- Only the Argon2id hash is stored; the initial PIN is displayed **once** to the issuing officer for private delivery to the verified guardian; no public endpoint returns it.
- The guardian may keep using the school-issued PIN indefinitely unless the account is reset/revoked or the guardian chooses to change it.
- A second linked learner for the same active guardian uses the existing guardian account; do not reset the PIN just because a sibling is added.

### Guardian optional self-change (source-only branch V70)

- Within the *authenticated* Parent Portal: **Settings → Guardian PIN**.
- Guardian must enter current PIN, a different non-obvious eight-digit PIN twice, and submit while the session is valid and CSRF-protected.
- Server rechecks current PIN against Argon2id hash under a DB row lock, rotates the stored hash in one transaction, records guardian-actor audit event and revokes existing guardian sessions. Parent must sign in again using the new PIN.
- PINs and hashes must never enter logs, analytics, query strings, messages, URL links or staff reports; the browser clears entered PINs after submit.

### Director's visibility — important security clarification

The Director **must not be shown a guardian's privately chosen replacement PIN**, and passwords/PINs should never be stored in recoverable plaintext. Director-approved status reporting may show **PIN issued / PIN last changed date / change source: guardian or school**, **without PIN digits or hash**, plus a protected **Reset PIN** operation that issues a new one-time temporary PIN when identity is verified. Reset invalidates the old PIN and should revoke old sessions.

The current installed 140-migration schema has `guardian_accounts.pin_changed_at` and audit records, but the current runtime grants and staff read models for actor/status need a **separate isolated-DB acceptance/review**, not a blind migration or grant on the working database.

## C. Live data gap prioritization

The Director's screenshot earlier showed 484 active learners but only 4 guardian contact records and no phone numbers meeting the SMS policy. Confirm this in a fresh *permissioned read-only* summary before trusting the figures. Missing guardian information must be completed/imported correctly by office staff. **Never generate PINs blindly for learners without a verified registered guardian contact.**

## D. Current implementation status

The V70 branch adds the **source-only** guardian PIN self-change endpoint, transactional repository, authenticated settings form, runtime wiring and security tests. These do not update the school computer and should not be deployed yet: the GitHub V50 base has 100 SQL migrations while the working school local history is 140, with conflicting names for 096–100. Reconcile installed source and verify isolated PostgreSQL 17 grants and safety tests before preparing a conflict-safe installer.

The learner register's complete edit workflows, authorised contact-update API, finance integration, advanced school requirements and Director's redacted PIN status UI remain **planned**, not shipped. Finance sync remains disabled; formal full-system release blockers **0/5 cleared**.

## E. Acceptance checks

1. Authorised office user opens any assigned learner, sees completion badges, and can enter missing fields using the correct department's own server-side action.
2. Guardian contacts do not silently appear under Leadership & Staff. Parent Access & Guardian PINs remains the separate office.
3. The Bursar sees real ledger balances; ordinary teachers do not gain new finance rights.
4. Nursery office receipts and teacher issues are per-learner; no borrowing another learner's materials; requirements are versioned and printable.
5. Initial PIN remains valid if guardian declines to change it. Change requires the correct current PIN. Old sessions are revoked on change.
6. Director sees only update metadata, never the current or changed PIN; a Director-controlled audited PIN reset remains possible.
7. Mobile and desktop test: no missing buttons, giant horizontally clipped forms, or overlays hiding information; no cross-user navigation/history leakage.
8. No database or finance writes from read-only source review, tests, or UI staging.
