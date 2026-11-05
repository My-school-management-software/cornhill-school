-- Work Area 5: limit direct learner-table reads to class-register fields.
-- Administrators continue to use the guarded admin_list_students() RPC for full profiles.

REVOKE ALL PRIVILEGES ON TABLE public.students FROM anon;
REVOKE SELECT ON TABLE public.students FROM authenticated;
GRANT SELECT (
  id,
  admission_number,
  lin,
  p7_index_number,
  first_name,
  middle_name,
  last_name,
  gender,
  birth_year,
  date_of_birth,
  admission_date,
  class_id,
  learner_type,
  status,
  previous_school,
  created_at,
  admission_complete
) ON TABLE public.students TO authenticated;

-- These two finance RPCs are SECURITY DEFINER and must not be callable by anon/PUBLIC.
-- Their function bodies independently require auth.uid() and is_school_admin().
REVOKE ALL ON FUNCTION public.admin_apply_learner_fee_schedule(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_apply_learner_fee_schedule(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_list_active_finance_students_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_active_finance_students_v2() TO authenticated;

COMMENT ON TABLE public.students IS
  'Learner records. Authenticated direct SELECT is column-limited to class-register fields; administrators use guarded admin RPCs for confidential profile fields.';
