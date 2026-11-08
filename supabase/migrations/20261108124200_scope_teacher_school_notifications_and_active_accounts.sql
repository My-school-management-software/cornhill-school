-- Require a live, active school account for notifications.
-- Learner-specific role-wide notifications are restricted to the assigned teacher's class.
-- Notifications explicitly addressed to a user remain visible only to that recipient.
CREATE OR REPLACE FUNCTION public.list_school_notifications()
RETURNS TABLE(
 id uuid,
 category text,
 severity text,
 title text,
 message text,
 student_id uuid,
 action_workspace text,
 created_at timestamptz,
 source_key text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
 v_role text;
BEGIN
 IF auth.uid() IS NULL THEN
   RAISE EXCEPTION 'Sign-in required' USING errcode = '42501';
 END IF;

 SELECT up.role
 INTO v_role
 FROM public.user_profiles up
 WHERE up.id = auth.uid()
   AND coalesce(up.employment_status, 'Active') = 'Active';

 IF v_role IS NULL THEN
   RAISE EXCEPTION 'An active school account is required' USING errcode = '42501';
 END IF;

 IF coalesce(public.is_school_admin(), false) THEN
   RETURN QUERY
     SELECT n.id,n.category,n.severity,n.title,n.message,n.student_id,
            n.action_workspace,n.created_at,n.source_key
     FROM public.school_notifications n
     WHERE n.archived_at IS NULL
       AND (
         n.student_id IS NULL
         OR EXISTS (
           SELECT 1
           FROM public.students s
           WHERE s.id = n.student_id
             AND s.status <> 'Archived'
         )
       )
     ORDER BY CASE n.severity WHEN 'urgent' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
              n.created_at DESC
     LIMIT 150;
 ELSE
   RETURN QUERY
     SELECT n.id,n.category,n.severity,n.title,n.message,n.student_id,
            n.action_workspace,n.created_at,n.source_key
     FROM public.school_notifications n
     WHERE n.archived_at IS NULL
       AND (
         n.student_id IS NULL
         OR EXISTS (
           SELECT 1
           FROM public.students s
           WHERE s.id = n.student_id
             AND s.status <> 'Archived'
         )
       )
       AND (
         n.recipient_user_id = auth.uid()
         OR (
           n.audience_role = v_role
           AND (
             n.student_id IS NULL
             OR (
               v_role = 'Teacher'
               AND EXISTS (
                 SELECT 1
                 FROM public.students s
                 WHERE s.id = n.student_id
                   AND s.status <> 'Archived'
                   AND public.is_class_teacher_for_class(s.class_id)
               )
             )
           )
         )
       )
     ORDER BY CASE n.severity WHEN 'urgent' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
              n.created_at DESC
     LIMIT 100;
 END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_school_notification(
 p_notification_id uuid,
 p_reason text DEFAULT 'Dismissed by user'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
 v_row public.school_notifications%rowtype;
 v_role text;
BEGIN
 IF auth.uid() IS NULL THEN
   RAISE EXCEPTION 'Sign-in required' USING errcode = '42501';
 END IF;

 SELECT up.role
 INTO v_role
 FROM public.user_profiles up
 WHERE up.id = auth.uid()
   AND coalesce(up.employment_status, 'Active') = 'Active';

 IF v_role IS NULL THEN
   RAISE EXCEPTION 'An active school account is required' USING errcode = '42501';
 END IF;

 SELECT n.*
 INTO v_row
 FROM public.school_notifications n
 WHERE n.id = p_notification_id
 FOR UPDATE;

 IF NOT FOUND THEN
   RAISE EXCEPTION 'Notification not found';
 END IF;

 IF NOT coalesce(public.is_school_admin(), false)
    AND v_row.recipient_user_id IS DISTINCT FROM auth.uid() THEN
   IF v_row.audience_role IS NULL OR v_row.audience_role IS DISTINCT FROM v_role THEN
     RAISE EXCEPTION 'You are not allowed to archive this notification' USING errcode = '42501';
   END IF;

   IF v_row.student_id IS NOT NULL THEN
     IF v_role <> 'Teacher'
        OR NOT EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.id = v_row.student_id
            AND s.status <> 'Archived'
            AND public.is_class_teacher_for_class(s.class_id)
        ) THEN
       RAISE EXCEPTION 'This learner notification belongs to another class' USING errcode = '42501';
     END IF;
   END IF;
 END IF;

 UPDATE public.school_notifications
 SET archived_at = now(),
     archived_by = auth.uid(),
     archive_reason = left(coalesce(nullif(btrim(p_reason), ''), 'Dismissed by user'), 300)
 WHERE id = p_notification_id
   AND archived_at IS NULL;

 IF v_row.category = 'attendance' AND v_row.source_id IS NOT NULL THEN
   UPDATE public.staff_attendance_alerts
   SET status = 'read'
   WHERE id = v_row.source_id
     AND (staff_user_id = auth.uid() OR coalesce(public.is_school_admin(), false));
 END IF;
END;
$function$;
