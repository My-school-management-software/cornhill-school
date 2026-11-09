# Cornhill V2 — Extended Product and Technical Specification

This document extends `docs/NEW_SYSTEM_BLUEPRINT.md` with the additional requirements confirmed by the school. It is the implementation reference for the new development version.

## 1. Supported devices and multi-user operation

- Deliver a responsive Progressive Web App (PWA) accessible through Chrome/Edge on Windows 10, Windows 11, Android phones and tablets.
- Design for narrow phone screens first for teacher workflows; provide efficient wide-screen layouts for office computers.
- More than 10 computers and many phones must be able to use the same live Supabase-backed records concurrently. Do not store authoritative school data only in browser local storage.
- Support install-to-home-screen on Android and installable desktop shortcuts where supported. Core functions must also work in an ordinary browser.
- Windows 10 is already outside Microsoft's standard support lifecycle; support access through a currently supported browser, but recommend a supported Windows version for security-sensitive use. Do not promise OS security updates from this application.
- Use pagination, indexes, sensible query limits, realtime updates only where useful, and transaction-safe financial posting to support concurrent users.

## 2. Identity, learner code and admission

Every learner receives one permanent school code at admission. It must never include class, stream, or other details that change after admission. It remains identical through class promotion, transfer within the school, and the learner's entire time at Cornhill; it is never reassigned after leaving.

Proposed human-readable format: `CH` + gender marker (`M`, `F`, or `X`) + two-digit admission year + six-digit school-wide sequence, e.g. `CHF26-000123`. The school-wide sequence guarantees uniqueness even when multiple classes admit learner number 1 in the same year. Store the requested class-specific admission sequence separately for class admission reporting. Generate the code server-side in a database transaction with a unique constraint; never generate it in the browser. Search and payment lookup must accept this code or learner name. Do not encode gender in the code if the school later chooses a privacy-preserving neutral code; make the format configurable before launch.

## 3. Teacher class portal and permissions

- Each staff member signs in with their own named account.
- Administrator can create, set, reset, expire and rotate a class portal access password/PIN.
- A class password is an additional access gate, not a replacement for individual authentication or database authorization. It must not grant a teacher access to unassigned classes or financial records.
- Store only a strong password hash or a securely handled short-lived access credential; never store plaintext passwords. Rate-limit attempts, log resets and failed attempts, and allow immediate administrator revocation.
- Teachers see only their assigned classes/subjects and the learner information necessary for teaching.
- Teachers can enter marks from phones, save drafts, submit results for approval, and flag suspected errors in report cards. Preserve who changed a mark, when, old/new value and approval history. Lock published results; corrections require an authorized reopen/amendment with an audit entry.
- Provide a responsive class portal with class roster, attendance, assignments, marks, learner performance and report-card preview.

## 4. Theme, typography and motion

Provide a professional appearance customizer with at least 8 curated themes and at least 20 font choices. Initial theme concepts:
1. Cornhill Classic (school brand)
2. Royal Blue
3. Emerald Professional
4. Burgundy Academic
5. Midnight Slate
6. Warm Sand
7. Ocean Teal
8. Lavender Modern
9. High Contrast Accessibility
10. Soft Light

Offer 20 readable font options, grouped by sans-serif, serif and display categories. Prefer well-supported web fonts with sensible system fallbacks and lazy-load optional font files. Theme/font choices must not reduce contrast or readability. Provide reduced-motion and high-contrast settings.

Some themes may use restrained animation (subtle gradient movement, ambient shapes, gentle transitions, dashboard chart entrance). Animation must be optional, lightweight, never block form use, and respect the operating system's reduced-motion preference. No distracting animation on marks entry, payment, attendance or other data-entry screens. Keep printable reports free of animation and use a dedicated print stylesheet.

## 5. Staff time and attendance; biometric integration

Build a Jibble-inspired staff attendance module with clock-in/out, breaks, shift schedules, late/early rules, leave requests, overtime approval, timesheets, corrections and audit trail. Provide phone/web check-in and administrator-configured attendance devices.

Fingerprint attendance is a hardware integration, not a feature that a normal phone or browser can universally provide. Support compatible fingerprint terminals/scanners through a vendor API, secure local gateway/agent, or documented device integration. Before buying hardware, confirm its model, SDK/API, network mode and licensing. Prefer storing a device's signed match result and a non-reversible vendor reference rather than raw fingerprint images/templates in the school database. Do not collect or store raw biometric templates in the web app. Provide a non-biometric fallback (PIN/card/admin correction) for outages, consent/operational exceptions, and device failures. Restrict biometric administration and log every attendance correction.

## 6. Staff profiles and secure documents

Staff records include photo, legal name, contacts, NIN (highly restricted), role/job title, teaching/non-teaching category, responsibilities, employment type, reporting/start date, contract end/termination date, salary and pay schedule, next of kin/emergency contact, qualifications and employment status.

Support private PDF attachments for identity documents, academic certificates, contracts, appointment letters and other HR documents. Store in a private Supabase Storage bucket with per-role and per-record authorization, short-lived signed access, upload size/type checks, malware scanning where available, audit logs and retention rules. Never use public storage URLs for NIN or HR files. Limit NIN visibility to specifically authorized administrators/HR users.

## 7. Financial system — additional income and charges

Use a charge catalogue configurable by administrator/bursar for each school year and term. In addition to tuition, boarding and meals, support:
- Top Class graduation
- P.7 mock examinations
- P.7 PLE facilitation
- P.7 pre-PLE
- P.7 West Ankole Diocese fees
- School uniform
- School sweater
- Sportswear
- Other configurable learner charges and school income items

Graduation, mock, PLE facilitation, pre-PLE and Diocese fees should be configurable per eligible learner/class/term, with amount set by authorized finance staff. Each learner's charge status is automatically calculated as Paid, Part-paid/Balance, or Nil/Unpaid based on posted transactions and approved waivers/credits. A zero charge should be clearly distinguished from an unpaid charge. Every posted payment must produce a receipt linked to the payment ledger entry.

Uniform, sweater and sportswear sales belong under **Other School Income / Sales**, with item catalogue, sizes/variants, quantities, price, stock movement and receipt. Do not treat a sale as a tuition charge. Dashboard income must show fee collections, other learner charges, uniform/sportswear sales and other income as separate categories as well as totals.

### Finance controls recommended
- Fee invoices/charge schedules, discounts and approved waivers.
- Payment methods: cash, bank, mobile money and other configured methods; record transaction/reference number and payer.
- Search by permanent learner code or name before posting payment; show learner identity/class and confirm before saving.
- Partial payments and allocation across selected charges; prevent accidental duplicate posting using idempotency/reference checks.
- Sequential receipt number, printable PDF/thermal receipt, reprint marker, cashier, date/time, method and allocations.
- Reversal/refund workflow instead of deleting or silently editing posted transactions.
- Daily cashier shift opening/closing, cash reconciliation, bank/mobile-money reconciliation and variance reporting.
- Debtors/ageing, collection by class/term/charge, payment plan, overdue follow-up, bursary/sponsor credits.
- Petty cash, purchase orders, supplier bills, expense approvals, expense vouchers, budgets, bank accounts, transfers, and cashbook.
- Income statement, cash-flow report, balance sheet foundations, trial balance/general ledger only when a proper double-entry ledger is implemented; do not label simple cash summaries as audited accounts.
- Role separation: cashier can post payments but cannot delete/reverse them; reversal/discount approvals require designated authorization. Audit all financial actions.
- Dashboard should show gross collections by source, other income, expenses, net cash movement, outstanding learner charges, daily collection and cashier reconciliation status. Clearly label cash basis vs accrual basis and date/term filters.

## 8. Communication, school community and calendar

Build an internal staff community feed inspired by familiar social-feed patterns (posts, photos, short videos, comments, reactions, announcements and pinned notices), but use Cornhill branding rather than copying Instagram's interface or branding. Access is private to authorized staff. Include direct and group text messaging, file sharing, read status and searchable conversations.

Voice/video calling requires WebRTC plus a reliable signaling and STUN/TURN/media infrastructure or a vetted communications provider. Treat this as a separate integration and cost/security decision; do not promise free unlimited calls. Begin with announcements and secure messaging, then add audio/video after provider selection and testing. Never expose call-room links publicly.

Include school calendar with academic terms, holidays, examinations, events, staff meetings, deadlines, reminders and role/class-specific visibility. Support event permissions and optional calendar export.

Teacher-parent messaging is a later controlled portal feature. Keep parent access separate from staff access, verify guardian contact ownership, and do not expose other learners' information. Translation may be offered as an optional assistive feature with original message preserved. SMS, email and push broadcasts require provider configuration and opt-in/consent controls.

## 9. Learning Management System

- Assignment creation with class/subject/due date, instructions, attachments, submissions, teacher feedback and late status.
- Content repository for lesson plans, PDFs, slides, safe video links and digital learning materials with role/class access.
- Gradebook with configurable weighted assessments, rubrics, continuous assessment and analytics.
- Plagiarism checking is a future external integration; do not claim plagiarism detection without a selected service and explain its limitations.
- Parent/learner portal and online learning access are later phases after identity, privacy and device-access rules are agreed.

## 10. Additional operational modules

- Cafeteria POS: item catalogue, sales, learner/staff identification, payment mode, receipt and stock integration. Any stored-value wallet requires ledger controls and guardian safeguards.
- Library: catalogue, copies, issue/return, overdue tracking, fines only if school approves, and learner code lookup.
- Transport/fleet: vehicles, drivers, routes, stops, assigned learners, trip attendance/check-in, maintenance, fuel and incident logs. Live GPS tracking is a separate consent, hardware and recurring-cost decision.
- Digital permission slips: trip details, guardian consent, digital acknowledgement/signature, submission deadline and status register. Retain evidence and limit access.

## 11. Delivery order and scope discipline

Build and test in this order:
A. Responsive application shell, sign-in, role permissions, audit log, school settings, themes/fonts, class/stream setup and permanent learner code.
B. Learner profiles and private document/photo storage.
C. Teacher phone portal, class access gate, attendance and staff timekeeping foundations.
D. Academic setup, marks entry, approvals, report cards and transcript archive.
E. Fees, configurable charge catalogue, payment ledger, receipts, bursaries, other income, uniform sales, accounting controls.
F. Staff HR documents, payroll and inventory.
G. Calendar, notices, staff feed and secure messaging.
H. LMS, parent portal, voice/video provider, biometric device connector, cafeteria, library and transport.
I. End-to-end tests, security review, performance/load checks for concurrent users, backups/restore test, Android/Windows browser tests and staged deployment.

Do not add real school data until authorization tests, backups and restore, financial reconciliation, and acceptance tests pass. Keep production `main` unchanged until the school approves the tested release.
