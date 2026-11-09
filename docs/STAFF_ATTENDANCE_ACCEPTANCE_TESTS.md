# CORNHILL Staff Attendance Integrity Test Batch

**Review date:** 6 November 2026  
**Environment:** connected Supabase project; read-only inspection. No attendance, staff, device or payroll rows were changed.

## 24 database checks — all PASS

1–6. RLS enabled on attendance events, adjustments, work schedules, schedule assignments, device-user mappings and import batches.
7–8. Attendance event staff and recording actors reference existing staff profiles.
9. No duplicate attendance deduplication keys.
10. Attendance event timestamps are present.
11–13. Adjustment staff references valid; reasons present; reviewed adjustments carry reviewer and timestamp.
14–15. Work schedule end time follows start time; grace and break minutes are non-negative.
16–17. Schedule assignments reference valid schedules and staff.
18–19. Device mappings reference valid staff and contain nonblank serial/device-user identifiers.
20. Import batch row counters are non-negative.
21–23. Attendance incidents reference staff, deductions are non-negative, and reviewed incidents carry reviewer and timestamp.
24. Attendance alerts reference existing staff.

## Limitation

All eight inspected attendance tables currently contain zero rows: events, adjustments, schedules, schedule assignments, device mappings, import batches, incidents and alerts. Therefore data-integrity checks on those tables passed over empty datasets. These checks do not validate clock-in/out, late arrival calculations, schedule assignment, CSV import, offline sync, device connection or payroll deductions in a real workflow.

## Pending end-to-end tests

- Create and assign a work schedule in an isolated test environment.
- Verify clock-in/out and duplicate event handling.
- Verify lateness/grace calculations and absence detection.
- Submit, approve and reject an attendance correction.
- Import a test CSV twice and verify deduplication.
- Test offline correction queue and reconnect sync.
- Test approved attendance incidents and payroll deduction linkage.
- Verify staff see only their permitted attendance data and administrators can review all staff.
- Hardware connection remains inactive pending confirmed device compatibility and physical test.
