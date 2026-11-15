-- Least-privilege grants for the atomic local learner-admission workflow.
-- The HTTP layer enforces admissions.register_learner and the additional
-- LIN/guardian permissions before this API is called.
BEGIN;

GRANT USAGE ON SCHEMA cornhill_school TO cornhill_auth_runtime;
GRANT USAGE ON SEQUENCE cornhill_school.pupil_code_sequence TO cornhill_auth_runtime;
GRANT EXECUTE ON FUNCTION cornhill_school.generate_pupil_code() TO cornhill_auth_runtime;

GRANT INSERT (
  first_name,middle_name,last_name,gender,date_of_birth,lin,class_id,admission_date,
  learner_type,previous_school,p7_index_number,is_bursary,bursary_fee_ugx,
  bursary_category,bursary_reason,takes_breakfast,takes_lunch,admission_complete
) ON cornhill_school.learners TO cornhill_auth_runtime;
GRANT SELECT (
  id,pupil_code,lin,first_name,middle_name,last_name,gender,date_of_birth,class_id,
  admission_date,status,is_bursary,bursary_fee_ugx
) ON cornhill_school.learners TO cornhill_auth_runtime;

GRANT INSERT (
  learner_id,guardian_name,relationship,phone_e164,whatsapp_e164,email,is_primary,
  sms_opt_in,whatsapp_opt_in
) ON cornhill_school.guardian_contacts TO cornhill_auth_runtime;
GRANT INSERT (
  learner_id,admission_date,class_id,created_by_staff_id
) ON cornhill_school.enrolment_periods TO cornhill_auth_runtime;
GRANT INSERT (
  learner_id,event_code,actor_staff_id,reason,details
) ON cornhill_school.admission_events TO cornhill_auth_runtime;

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON cornhill_school.learners, cornhill_school.guardian_contacts,
     cornhill_school.enrolment_periods, cornhill_school.admission_events
  FROM cornhill_auth_runtime;

COMMIT;
