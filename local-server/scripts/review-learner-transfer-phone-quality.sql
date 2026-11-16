-- CORNHILL learner transfer phone-quality review (READ ONLY).
-- Run against the source Supabase project before exporting learner data.
-- Results contain private guardian contact details. Review locally; do not paste them into ChatGPT.
WITH learner_phones AS (
 SELECT s.admission_number,'guardian_phone'::text AS field_name,s.guardian_phone::text AS phone_value
 FROM public.students s WHERE s.status='Active' AND s.archived_at IS NULL AND NULLIF(trim(s.guardian_phone::text),'') IS NOT NULL
 UNION ALL
 SELECT s.admission_number,'alternate_guardian_phone',s.alternate_guardian_phone::text
 FROM public.students s WHERE s.status='Active' AND s.archived_at IS NULL AND NULLIF(trim(s.alternate_guardian_phone::text),'') IS NOT NULL
 UNION ALL
 SELECT s.admission_number,'guardian_whatsapp_phone',s.guardian_whatsapp_phone::text
 FROM public.students s WHERE s.status='Active' AND s.archived_at IS NULL AND NULLIF(trim(s.guardian_whatsapp_phone::text),'') IS NOT NULL
 UNION ALL
 SELECT s.admission_number,'separate_guardian_phone',g.phone_e164::text
 FROM public.parent_guardian_contacts g JOIN public.students s ON s.id=g.student_id
 WHERE s.status='Active' AND s.archived_at IS NULL AND NULLIF(trim(g.phone_e164::text),'') IS NOT NULL
 UNION ALL
 SELECT s.admission_number,'separate_guardian_whatsapp_phone',g.whatsapp_e164::text
 FROM public.parent_guardian_contacts g JOIN public.students s ON s.id=g.student_id
 WHERE s.status='Active' AND s.archived_at IS NULL AND NULLIF(trim(g.whatsapp_e164::text),'') IS NOT NULL
), checked AS (
 SELECT admission_number,field_name,phone_value,
 regexp_replace(phone_value,'[[:space:]()-]','','g') AS normalized
 FROM learner_phones
)
SELECT admission_number,field_name,phone_value
FROM checked
WHERE normalized !~ '^(0[0-9]{9}|256[0-9]{9}|\\+256[0-9]{9})$'
ORDER BY admission_number,field_name;
