-- CORNHILL retain an append-only independent review trail for daily attendance.
BEGIN;
CREATE TABLE cornhill_school.attendance_day_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_day_id uuid NOT NULL REFERENCES cornhill_school.attendance_days(id) ON DELETE RESTRICT,
  staff_account_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  attendance_date date NOT NULL,
  review_status text NOT NULL CHECK (review_status IN ('Verified','Correction Required')),
  review_note text NOT NULL CHECK (length(trim(review_note)) BETWEEN 5 AND 1000),
  reviewed_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_day_review_events_day_idx
  ON cornhill_school.attendance_day_review_events(attendance_day_id,reviewed_at DESC);
CREATE INDEX attendance_day_review_events_queue_idx
  ON cornhill_school.attendance_day_review_events(review_status,attendance_date DESC);
INSERT INTO cornhill_auth.permission_catalog(permission_code,category,description,high_risk)
VALUES ('staff.attendance_review','staff','Review and verify daily staff attendance records.',true)
ON CONFLICT(permission_code) DO NOTHING;
REVOKE ALL ON TABLE cornhill_school.attendance_day_review_events FROM PUBLIC;
COMMIT;
