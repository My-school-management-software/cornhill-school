-- Preserve existing school-wide choices while moving report-card settings to class scope.
alter table public.school_document_template_settings
  drop constraint if exists school_document_template_settings_document_section_check,
  drop constraint if exists school_document_template_settings_school_section_check;

insert into public.school_document_template_settings
  (document_type, school_section, template_key, settings, updated_by, updated_at)
select
  'report_card',
  mapping.class_key,
  source.template_key,
  source.settings,
  source.updated_by,
  source.updated_at
from public.school_document_template_settings as source
cross join lateral (
  values
    ('nursery','baby'),('nursery','middle'),('nursery','top'),
    ('lower_primary','p1'),('lower_primary','p2'),('lower_primary','p3'),
    ('upper_primary','p4'),('upper_primary','p5'),('upper_primary','p6'),('upper_primary','p7')
) as mapping(source_group,class_key)
where source.document_type='report_card'
  and source.school_section=mapping.source_group
on conflict (document_type,school_section) do nothing;

delete from public.school_document_template_settings
where document_type='report_card'
  and school_section in ('nursery','lower_primary','upper_primary');

alter table public.school_document_template_settings
  add constraint school_document_template_settings_school_section_check
  check (school_section in ('baby','middle','top','p1','p2','p3','p4','p5','p6','p7','all'));

alter table public.school_document_template_settings
  add constraint school_document_template_settings_document_section_check
  check (
    (document_type='report_card' and school_section in ('baby','middle','top','p1','p2','p3','p4','p5','p6','p7'))
    or
    (document_type='receipt' and school_section='all')
  );

comment on table public.school_document_template_settings is
  'Class-specific CORNHILL report-card template settings for Baby, Middle, Top and P1-P7, plus shared receipt template settings. Only active school administrators may change settings; authenticated users may read them.';
