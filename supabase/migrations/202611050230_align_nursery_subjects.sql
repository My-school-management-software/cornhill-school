-- Keep Baby, Middle and Top aligned with the six approved Nursery subjects.
delete from public.class_subjects cs using public.school_classes c, public.subjects s where c.id = cs.class_id and s.id = cs.subject_id and c.name in ('Baby','Middle','Top') and s.name = 'Numbers';
