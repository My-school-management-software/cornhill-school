-- Link public admission enquiries to the canonical learner record.
-- Reviews remain administrator-only; public submissions remain pending-only.
ALTER TABLE public.school_admission_enquiries
  ADD COLUMN IF NOT EXISTS student_id uuid,
  ADD COLUMN IF NOT EXISTS registered_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.school_admission_enquiries'::regclass
      AND conname = 'school_admission_enquiries_student_id_fkey'
  ) THEN
    ALTER TABLE public.school_admission_enquiries
      ADD CONSTRAINT school_admission_enquiries_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.school_admission_enquiries
  DROP CONSTRAINT IF EXISTS school_admission_enquiries_status_check;
ALTER TABLE public.school_admission_enquiries
  ADD CONSTRAINT school_admission_enquiries_status_check
  CHECK (status = ANY (ARRAY[
    'Pending'::text, 'Contacted'::text, 'Visit scheduled'::text,
    'Approved for admission'::text, 'Registered'::text,
    'Not proceeding'::text, 'Closed'::text
  ]));

CREATE INDEX IF NOT EXISTS school_admission_enquiries_created_at_desc_idx
  ON public.school_admission_enquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS school_admission_enquiries_student_id_idx
  ON public.school_admission_enquiries (student_id)
  WHERE student_id IS NOT NULL;

COMMENT ON COLUMN public.school_admission_enquiries.student_id IS
  'Links the enquiry to the canonical learner record after formal admission in the main school register.';
COMMENT ON COLUMN public.school_admission_enquiries.registered_at IS
  'Time when the enquiry was linked to the canonical learner record.';
