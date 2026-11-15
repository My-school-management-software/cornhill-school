-- Add the attendance import capability to the Director-controlled permission catalogue.
-- Existing role grants are deliberately not changed.
BEGIN;

INSERT INTO cornhill_auth.permission_catalog (
  permission_code, category, description, high_risk
)
VALUES (
  'staff.attendance_import',
  'staff',
  'Register attendance devices, map terminal staff identifiers and import audited attendance event files.',
  true
)
ON CONFLICT (permission_code) DO NOTHING;

COMMIT;
