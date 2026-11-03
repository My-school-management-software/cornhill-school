# Cornhill School Management System — New Version Blueprint

## Product direction

Build a mobile-first, browser-based school operations platform for CORNHILL NURSERY AND PRIMARY SCHOOL in Uganda. It must work on Android Chrome and desktop browsers, use Supabase/PostgreSQL for shared online data, display money in UGX, and support printable school documents.

This is a new, modular implementation. Do not copy another vendor's product or treat a static dashboard as a finished system. Keep the production `main` branch untouched until the development version has passed review and acceptance tests.

## School structure

Seed the following levels: Baby, Middle, Top, P.1, P.2, P.3, P.4, P.5, P.6, P.7. Support streams within a level and school-year/term assignments.

P.7 is boarding only. Nursery through P.6 may be day or boarding. Meal charges apply from Nursery through P.6.

## Modules and connected workflows

1. **Dashboard** — live counts by class, gender, boarding/day, staff category, attendance, collections, arrears, expenses, inventory alerts, and notices. Every number must be computed from authorized database records, not hard-coded.
2. **Learners** — admission number, names, photo, gender, DOB, admission date, class, day/boarding, meal participation, guardian contacts, address, previous school, bursary status, active/transferred status, and learner history. Include create, edit, search, class transfer, and profile printing.
3. **Classes** — nursery and primary levels, streams, class lists, class teacher, enrolment and linked attendance, fees, and academic records.
4. **Academics** — school years, terms 1–3, Beginning/Mid/End of Term assessment periods, class subjects, assigned subject teachers, assessment entry, grading configuration, totals, averages, grades, rankings, class summaries, analysis, promotion, and year-end summaries. Support school-configurable grading rather than hard-coding an assumed UNEB scale.
5. **Report cards** — attractive printable reports with school branding, learner details, subject marks, aggregates/grades, position, attendance, editable teacher/headteacher comments, and term/year summaries. Suggested comments must be derived from actual performance and remain editable; do not silently publish AI-generated text.
6. **Fees and receipts** — configurable fee schedules by class, learner type, meal participation, school year and term; payment posting; partial payments; balances; payment history; class and school collection reports; receipt numbers and printable receipts. A receipt must reference an immutable, persisted payment record.
7. **Accounting** — income, expense categories, expense entries, payment methods, cash-flow summaries, outstanding fees, and period-based reports. Reconcile fee payment records with income reporting; avoid double-counting.
8. **Staff and payroll** — staff profiles, teaching/non-teaching category, job title, contacts, employment details, salary, pay schedule, monthly salary due/paid/balance, three-month term totals, payment history and printable payroll summaries.
9. **Inventory** — categories, items, units, suppliers, purchases, stock received/issued, movement ledger, balances, reorder thresholds, low-stock alerts and reports.
10. **Attendance** — daily learner attendance (Present, Absent, Late, approved additional statuses), staff attendance where enabled, class registers, and daily/weekly/monthly/term summaries. Prevent duplicate attendance for a learner/class/date/session.
11. **Bursaries** — learner awards, sponsor/source, amount or percentage/fee coverage, term validity, amount applied, remaining coverage and learner balance.
12. **Reports and administration** — role-aware reports, school profile/branding, academic year and term setup, fee/grading configuration, user management, audit history, and data export/backup procedures.

## Initial fee schedule supplied by the school

All values are UGX. Treat these as initial defaults that an authorized administrator can edit by academic year/term; do not bake them into payment calculation code.

| Class | Tuition | Boarding |
|---|---:|---:|
| Baby–Middle | 40,000 | 185,000 |
| Top | 45,000 | 185,000 |
| P.1–P.2 | 50,000 | 205,000 |
| P.3–P.4 | 60,000 | 205,000 |
| P.5 | 70,000 | 205,000 |
| P.6 | 85,000 | 225,000 |
| P.7 | Not offered | 250,000 |

Meal defaults for Nursery–P.6: breakfast UGX 20,000; lunch UGX 50,000. P.7 is boarding only. Confirm whether these meal amounts are per term before activating them as fee schedule defaults.

## Access model

Support individual Supabase Auth accounts and role-based authorization: Administrator, Headteacher, Bursar, Teacher, and other authorized staff. Apply least privilege in database RLS and server-side operations, not merely by hiding buttons. Teachers should only access assigned classes/subjects where applicable. Financial and payroll data must be restricted to authorized finance/admin roles. Maintain an audit trail for sensitive financial, academic, and account changes.

Never expose a Supabase service-role or secret key in browser code. Use publishable keys in public clients and enforce authorization with RLS and trusted server-side operations. Review every SECURITY DEFINER function, restrict EXECUTE grants, set a safe search_path, and run Supabase security advisors after schema changes.

## Proposed delivery sequence

- **Phase 0 — Audit and architecture:** inspect the existing repository, identify current app/backend/schema/hosting, document gaps, and agree the target architecture.
- **Phase 1 — Foundation:** responsive app shell, authentication, staff profiles/roles, school settings, school years/terms, class structure, learner records, storage policies, audit foundation.
- **Phase 2 — Daily operations:** attendance, class registers, learner history, notices.
- **Phase 3 — Academics:** subjects, teacher assignments, assessments, configurable grading, ranking, report cards and promotion.
- **Phase 4 — Finance:** fee schedules, learner accounts, payments/receipts, bursaries, income/expenses and reconciliations.
- **Phase 5 — People and resources:** staff, payroll, inventory, suppliers and stock movement.
- **Phase 6 — Reports and readiness:** printable reports, permissions tests, backup/export, mobile testing, end-to-end acceptance tests, deployment and staff onboarding.

## Acceptance principles

- A learner registered once is available to relevant class, attendance, academic, fee and bursary workflows through relational links.
- Payments are append-only ledger events with unique receipt references; corrections use reversal/adjustment records rather than silently rewriting payment history.
- Fee balances are derived from fee charges, approved bursary credits and posted payments.
- Payroll balances are derived from salary obligations and posted salary payments.
- Inventory balances are derived from stock movements.
- Rankings and report-card totals are reproducible from stored marks and the configured grading rules.
- Every sensitive action is authorized server-side and auditable.
- All modules are tested on a small Android screen and desktop before live school data is entered.

## Open decisions to confirm before financial implementation

1. Are the breakfast and lunch amounts charged per term, per month, or another period?
2. Are the listed tuition/boarding figures per term?
3. Should a bursary be a fixed UGX amount, a percentage, full/partial fee coverage, or all three?
4. What exact assessment subjects and grading/aggregate rules does the school use for each class and assessment period?
