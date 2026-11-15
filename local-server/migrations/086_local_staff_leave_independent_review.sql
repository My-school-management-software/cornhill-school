-- Permit narrowly scoped, independent review of submitted leave requests.
-- The database transition guard supplies reviewed_at and enforces reviewer separation.
BEGIN;
GRANT UPDATE (status, reviewed_by_staff_id, review_note)
  ON cornhill_school.staff_leave_requests TO cornhill_auth_runtime;
COMMIT;
