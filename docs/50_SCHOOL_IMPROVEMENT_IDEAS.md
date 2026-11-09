# CORNHILL school management system — 50 improvement ideas

This is a proposed work plan, not a claim that all items are already implemented. Existing modules should be strengthened before adding features that create new data or permissions.

## A. Accounts, privacy and security

1. **Independent account workspaces** — clear private UI state, guard late asynchronous responses by account/session, and scope local preferences and drafts to the signed-in account.
2. **Permission matrix** — define exactly which pages, records and actions each job role may view, create, approve, print or export.
3. **Subject-teacher accounts** — support teachers who teach named subjects across assigned classes, with class-and-subject-limited access rather than full class-teacher access.
4. **Delegated school duties** — give a bursar, store manager, DOS or deputy only the approved modules and actions, without making them administrators.
5. **Safe staff onboarding/offboarding** — invitations, password setup, role assignment, class/subject handover, leave suspension and immediate account deactivation.
6. **Session protection** — local sign-out on shared computers, inactivity locking, clear current-account display and stale-request cancellation.
7. **Security audit trail** — record who changed important school information, when, what changed and who approved it.
8. **Administrator safeguards** — optional additional sign-in verification where supported, strong password checks, recovery controls and a second approval for especially sensitive actions.

## B. Teaching, marks and academic management

9. **One curriculum-aware class register** — show only the subjects and assessment periods relevant to Baby through P7.
10. **Subject-teacher workload view** — list each teacher’s assigned classes, subjects, periods, deadlines and learners awaiting attention.
11. **Cover-teacher arrangements** — allow an authorised temporary teacher to cover a class or subject for a defined date range, with an audit record.
12. **Marks autosave drafts** — clearly distinguish saved marks from drafts and recover interrupted work without duplicating entries.
13. **Excel import profiles** — remember approved column mappings for the school’s recurring workbook formats.
14. **Import validation centre** — preview unmatched headers, duplicates, missing learners, out-of-range marks and rows that will be skipped before saving.
15. **Assessment calendar** — plan beginning, midterm, end-of-term and P6/P7 set assessments with class-specific deadlines.
16. **Marks moderation** — let a headteacher or DOS review unusual results, missing marks and corrections before results are published.
17. **Change history for results** — show original and revised marks, editor, time, reason and approval.
18. **Learner progress trends** — compare a learner’s current result with earlier periods without exposing another class’s private records.
19. **Remedial support tracker** — record learning support goals, follow-up dates and progress for learners who need extra help.
20. **Report-card quality checks** — flag missing compulsory subjects, incomplete marks, absent codes, duplicate positions and unapproved results before publication.

## C. Learner and parent/guardian services

21. **Learner attendance register** — daily attendance, late arrival, authorised absence and follow-up, separate from staff attendance.
22. **Conduct and achievement records** — balanced positive achievements, concerns, actions and parent follow-up with controlled access.
23. **Homework and classwork tracker** — teacher-set tasks, due dates, completion and feedback.
24. **Timetable and lesson planning** — class timetables, subject periods, room use and teacher assignments.
25. **Multiple-child guardian access** — one verified guardian can see only the learners explicitly linked to that guardian.
26. **Guardian access history** — log portal sign-ins, linked learner viewed and PIN/contact changes without showing private PIN values.
27. **Parent-school messaging** — a private conversation linked to the correct learner, with administrator oversight for safety and record-keeping.
28. **Secure report-card publication** — notify guardians when an approved report is ready and use revocable, time-limited access links.
29. **Family-friendly language support** — use clear English and carefully reviewed local-language explanations for important parent notices.
30. **Communication consent register** — record guardian-approved SMS/WhatsApp channels, preferred contact number and opt-out changes.

## D. Finance, bursary and accountability

31. **Class and learner fee schedules** — maintain approved fees by class, term, boarding/day status and applicable school package.
32. **Complete learner statements** — show charges, bursary awards, previous-term balances, allocations, payments and remaining balance.
33. **Multiple payment channels** — record cash, bank, MTN and Airtel payments with references and reconciliation status.
34. **Arrears follow-up** — produce private balance reminders and parent statements without exposing one family’s account to another.
35. **Daily cash and collection reconciliation** — compare receipts, payment methods, cashier totals, reversals and bank/mobile-money settlements.
36. **Budget versus actual reporting** — track income and spending by school term, department and activity in UGX.
37. **Expense and purchase approvals** — require supporting documents and delegated approval limits before school money is paid out.
38. **Payroll and payslips** — maintain salary history, allowances, deductions, approved attendance adjustments and employee payslips.
39. **Inventory reorder controls** — minimum stock levels, issue vouchers, store transfers, stock counts and supplier records.
40. **School asset register** — track desks, computers, books, equipment, condition, location, maintenance and responsible staff.

## E. Operations, staff and technology

41. **Supplier and purchasing records** — quotations, purchase orders, delivery checks, invoices and payment status.
42. **Transport management** — routes, vehicle records, authorised drivers, learner assignments and parent contact procedures, if the school operates transport.
43. **School health and emergency contact controls** — store only necessary emergency information, restricted to authorised staff.
44. **Staff leave and duty roster** — leave requests, approvals, substitutions, school duty schedules and handovers.
45. **Mobile teacher workspace** — make the class register, subject tools and learner search comfortable on Android phones and small screens.
46. **Verified fingerprint-device integration** — only connect a selected device after a tested Windows bridge, device identity checks and duplicate-event protection are in place.
47. **Backup restore testing** — scheduled backups, backup history, restore exercises and a clear recovery checklist; a backup is not proven until restoration is tested.
48. **Safe offline operation** — identify exactly which views are read-only offline, protect device-local records, and never silently queue official payments or marks.
49. **School management action centre** — prioritise urgent tasks such as unreviewed changes, incomplete reports, unallocated receipts and attendance exceptions.
50. **School calendar and event planner** — term dates, holidays, examinations, visiting days, graduation, meetings and staff deadlines.

## Recommended order

**First: privacy and access.** Finish independent sessions, role-specific notifications, attendance guards, permission reviews and account lifecycle handling.

**Second: academic reliability.** Complete class-by-class assessment setup, marks entry, import previews, saved-score checks, report-card previews and result approval.

**Third: staff and family access.** Build subject-teacher permissions and delegated operational duties before inviting those roles; keep the guardian portal separate.

**Fourth: finance and operations.** Complete receipt reconciliation, expense approvals, bursary statements, payroll and inventory controls.

**Fifth: resilience and reporting.** Test backup restoration, device workflows, offline limits, mobile usability and the school action centre.

The school should not enable a new role or workflow merely because a menu can be displayed. Its database permissions, account checks, audit history and real-device tests must be completed first.
