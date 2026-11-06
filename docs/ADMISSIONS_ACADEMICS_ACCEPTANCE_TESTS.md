# CORNHILL Admissions and Academic Integrity Test Batches

**Review date:** 6 November 2026  
**Environment:** connected Supabase project; read-only checks only.  
**Safety boundary:** no learner, guardian, bursary, class assignment, academic mark or publication record was changed.

## Batch A — 24 admission, identity, bursary, guardian and enrolment checks

All 24 checks passed:

1. RLS enabled on students.
2. RLS enabled on school classes.
3. RLS enabled on learner enrolment periods.
4. RLS enabled on bursary awards.
5. RLS enabled on guardian contacts.
6. No duplicate permanent admission codes.
7. No blank permanent admission codes.
8. No active learner without a class.
9. All learner class references resolve.
10. Learner type restricted to Day/Boarding.
11. No negative bursary fee.
12. Bursary learners have category and reason.
13. Non-bursary learners do not carry a positive bursary fee.
14. Bursary award amounts are non-negative and reasons present.
15. Bursary award effective date ranges valid.
16. No learner has multiple active enrolment periods.
17. Enrolment exit dates are not before admission.
18. Enrolment periods reference valid learners/classes.
19. SMS opt-in records have a phone number.
20. WhatsApp opt-in records have a WhatsApp number.
21. No learner has multiple active primary guardians.
22. Guardian contacts reference existing learners.
23. Class history references valid learners and destination classes.
24. Status history references valid learners.

**Data-volume limitation:** at test time, students=2, enrolment periods=2, bursary awards=1, guardian contacts=2, class history=0 and status history=0. Empty history tables mean the corresponding referential checks passed without exercising real transitions. No personal learner or guardian values were read for this check.

## Batch B — 22 academic integrity and role-assignment checks

| # | Check | Result |
|---:|---|---|
| 1–5 | RLS on assessments, scores, class-subject assignments, report publications and grade bands | PASS |
| 6–14 | Unique score per learner/assessment; non-negative scores; scores not above maximum; positive assessment maximum; valid term/class/subject links; assessment date inside term; score learner belongs to assessment class; valid and unique class-subject mappings | PASS |
| 15 | Every class-subject teacher assignment points to an active Teacher profile | FAIL — one assignment points to an Active Admin profile |
| 16–17 | Report publication learner/class/term references and class match | PASS |
| 18–19 | Academic and UNEB grade-band percentage ranges | PASS |
| 20–22 | Academic year and term date ranges; terms inside academic years | PASS |

### Follow-up on the failed academic check

An aggregate-only diagnostic found exactly one class-subject assignment mapped to an Active Admin profile. The application design requires class-subject teaching assignments to reference Teacher accounts. This mapping was not automatically changed because it may be a deliberate administrator assignment or stale setup. An authorised school administrator should review and reassign it to the correct teacher if appropriate.

**Data-volume limitation:** academic years=0, terms=0, assessments=0, assessment scores=0, report publications=0 and class-subject mappings=55. Academic date, marks and publication checks are currently structural checks over empty academic transaction tables. The one invalid teacher mapping is a real configuration exception, not a failed database query.

## Next required tests

- Verify admission and re-admission RPCs with an isolated test learner.
- Exercise full, partial and zero-payable bursary award flows, including finance charge linkage.
- Test boarding/day/P7 meal-plan enforcement and mid-term proration boundaries.
- Test guardian consent changes and multi-guardian portal isolation.
- Test class promotion, withdrawal and re-admission history preservation.
- Resolve the one Admin-to-class-subject assignment after school confirmation.
- Create an authorised teacher test account and configured test term before marks, report-card approval and role-based browser tests.

No real school records were edited. These are database integrity checks, not end-to-end browser or device tests.
