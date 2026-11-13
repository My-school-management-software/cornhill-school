alter table public.school_usage_events
  drop constraint if exists school_usage_event_valid;
alter table public.school_usage_events
  add constraint school_usage_event_valid
  check (event_type in (
    'page_view','admissions_form_started','admissions_form_submitted',
    'admissions_form_accepted','admissions_form_error',
    'parent_login_success','parent_login_failure'
  ));
