-- These directories contain staff and teacher-assignment metadata and are not public.
REVOKE ALL PRIVILEGES ON TABLE public.academic_teacher_directory FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.class_teacher_directory_assignment_history FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.class_teacher_directory_assignments FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.school_staff_directory FROM anon;

-- Preserve the public class sign-in directory, limited to its five display fields.
REVOKE ALL PRIVILEGES ON TABLE public.class_login_directory FROM anon;
GRANT SELECT (class_key, class_label, teacher_name, administrator_name, display_order)
  ON TABLE public.class_login_directory TO anon;

-- These sequence values are allocated through protected database functions/triggers.
REVOKE ALL PRIVILEGES ON SEQUENCE public.parent_contact_change_log_id_seq FROM anon;
REVOKE ALL PRIVILEGES ON SEQUENCE public.school_invoice_seq FROM anon;
REVOKE ALL PRIVILEGES ON SEQUENCE public.school_receipt_seq FROM anon;
REVOKE ALL PRIVILEGES ON SEQUENCE public.student_admission_sequence FROM anon;
