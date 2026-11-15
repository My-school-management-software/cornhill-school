-- CORNHILL Saturday attendance policy correction.
-- The school's latest confirmed Saturday studies window is 08:00–13:00.
BEGIN;

UPDATE cornhill_school.staff_attendance_policy_settings
SET saturday_start_time = '08:00',
    saturday_end_time = '13:00',
    updated_at = now()
WHERE id = true;

COMMIT;
