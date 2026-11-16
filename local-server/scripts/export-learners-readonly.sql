-- CORNHILL learner transfer export (READ ONLY).
-- Run in the Supabase SQL editor for project yemhortbudwbcrzsoozk.
-- Export the single JSON result to a local UTF-8 .json file. Keep it private.
-- Guardian PIN/recovery hashes and all authentication material are deliberately excluded.
WITH class_rows AS (
 SELECT id,name,CASE name WHEN 'P1' THEN 'P.1' WHEN 'P2' THEN 'P.2' WHEN 'P3' THEN 'P.3' WHEN 'P4' THEN 'P.4' WHEN 'P5' THEN 'P.5' WHEN 'P6' THEN 'P.6' WHEN 'P7' THEN 'P.7' ELSE name END AS local_name FROM public.school_classes
), learner_rows AS (
 SELECT s.*,c.local_name AS class_name FROM public.students s JOIN class_rows c ON c.id=s.class_id WHERE s.status='Active' AND s.archived_at IS NULL
), period_rows AS (
 SELECT p.*,c.local_name AS class_name FROM public.learner_enrolment_periods p LEFT JOIN class_rows c ON c.id=p.class_id WHERE p.student_id IN (SELECT id FROM learner_rows)
), alias_rows AS (
 SELECT a.* FROM public.learner_code_aliases a WHERE a.student_id IN (SELECT id FROM learner_rows)
), guardian_rows AS (
 SELECT g.* FROM public.parent_guardian_contacts g WHERE g.student_id IN (SELECT id FROM learner_rows)
)
SELECT jsonb_build_object(
 'format','cornhill-learner-transfer','version',1,
 'manifest',jsonb_build_object('sourceProjectRef','yemhortbudwbcrzsoozk','counts',jsonb_build_object(
  'classes',(SELECT count(*) FROM class_rows),'learners',(SELECT count(*) FROM learner_rows),
  'enrolmentPeriods',(SELECT count(*) FROM period_rows),'codeAliases',(SELECT count(*) FROM alias_rows),
  'guardianContacts',(SELECT count(*) FROM guardian_rows))),
 'classes',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',local_name) ORDER BY local_name) FROM class_rows),'[]'::jsonb),
 'learners',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',id,'admission_number',admission_number,'first_name',first_name,'middle_name',middle_name,'last_name',last_name,
  'gender',gender,'date_of_birth',date_of_birth,'birth_year',birth_year,'class_name',class_name,'admission_date',admission_date,
  'admission_year',admission_year,'learner_type',learner_type,'previous_school',previous_school,'p7_index_number',p7_index_number,
  'status',status,'lin',lin,'is_bursary',is_bursary,'bursary_fee_ugx',bursary_fee_ugx,'bursary_category',bursary_category,
  'bursary_reason',bursary_reason,'admission_complete',admission_complete,'takes_breakfast',takes_breakfast,'takes_lunch',takes_lunch,
  'guardian_name',guardian_name,'guardian_relationship',guardian_relationship,'guardian_phone',guardian_phone,'guardian_email',guardian_email,
  'guardian_sms_opt_in',guardian_sms_opt_in,'guardian_whatsapp_phone',guardian_whatsapp_phone,'guardian_whatsapp_opt_in',guardian_whatsapp_opt_in,
  'alternate_guardian_name',alternate_guardian_name,'alternate_guardian_phone',alternate_guardian_phone
 ) ORDER BY admission_number) FROM learner_rows),'[]'::jsonb),
 'enrolmentPeriods',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',id,'student_id',student_id,'admission_date',admission_date,'exit_date',exit_date,'class_name',class_name,
  'status',status,'exit_reason',exit_reason,'previous_period_id',previous_period_id,'created_at',created_at
 ) ORDER BY created_at,id) FROM period_rows),'[]'::jsonb),
 'codeAliases',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'student_id',student_id,'old_code',old_code,'new_code',new_code,'code_normalized',code_normalized,'changed_at',changed_at,'reason',reason
 ) ORDER BY changed_at,code_normalized) FROM alias_rows),'[]'::jsonb),
 'guardianContacts',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'student_id',student_id,'guardian_name',guardian_name,'relationship',relationship,'phone_e164',phone_e164,
  'whatsapp_e164',whatsapp_e164,'is_primary',is_primary,'is_active',is_active,'sms_opt_in',sms_opt_in,
  'whatsapp_opt_in',whatsapp_opt_in,'notes',notes,'created_at',created_at
 ) ORDER BY student_id,created_at,id) FROM guardian_rows),'[]'::jsonb)
) AS transfer_payload;
