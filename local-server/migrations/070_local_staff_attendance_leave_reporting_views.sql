-- CORNHILL secure read models for attendance review, monthly totals and leave balances.
BEGIN;
CREATE VIEW cornhill_school.attendance_monthly_summary
WITH (security_invoker=true)
AS
SELECT ad.staff_account_id,
       date_trunc('month',ad.work_date)::date AS month_start,
       count(*)::integer AS recorded_days,
       count(*) FILTER (WHERE ad.attendance_status='Present')::integer AS present_days,
       count(*) FILTER (WHERE ad.attendance_status='Late')::integer AS late_days,
       count(*) FILTER (WHERE ad.attendance_status='Absent')::integer AS absent_days,
       count(*) FILTER (WHERE ad.attendance_status='Half Day')::integer AS half_days,
       count(*) FILTER (WHERE ad.attendance_status='Leave')::integer AS leave_days,
       sum(ad.expected_minutes)::bigint AS expected_minutes,
       sum(ad.worked_minutes)::bigint AS worked_minutes
FROM cornhill_school.attendance_days ad
GROUP BY ad.staff_account_id,date_trunc('month',ad.work_date)::date;

CREATE VIEW cornhill_school.staff_leave_review_queue
WITH (security_invoker=true)
AS
SELECT lr.id,lr.staff_account_id,sp.legal_name,sp.staff_number,lr.leave_type,
       lr.starts_on,lr.ends_on,lr.requested_days,lr.reason,lr.submitted_at
FROM cornhill_school.staff_leave_requests lr
LEFT JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=lr.staff_account_id
WHERE lr.status='Submitted';

CREATE VIEW cornhill_school.staff_leave_balance_summary
WITH (security_invoker=true)
AS
SELECT staff_account_id,leave_type,sum(days_delta)::numeric(9,2) AS available_days
FROM cornhill_school.staff_leave_balance_entries
GROUP BY staff_account_id,leave_type;

CREATE VIEW cornhill_school.attendance_day_review_queue
WITH (security_invoker=true)
AS
SELECT DISTINCT ON (ad.id) ad.id AS attendance_day_id,ad.staff_account_id,ad.work_date,
       r.review_status,r.review_note,r.reviewed_by_staff_id,r.reviewed_at
FROM cornhill_school.attendance_days ad
LEFT JOIN cornhill_school.attendance_day_review_events r ON r.attendance_day_id=ad.id
ORDER BY ad.id,r.reviewed_at DESC NULLS LAST,r.created_at DESC NULLS LAST;
REVOKE ALL ON cornhill_school.attendance_monthly_summary,cornhill_school.staff_leave_review_queue,cornhill_school.staff_leave_balance_summary,cornhill_school.attendance_day_review_queue FROM PUBLIC;
COMMIT;
