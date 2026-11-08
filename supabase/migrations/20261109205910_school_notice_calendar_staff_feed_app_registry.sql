-- App Centre entries for existing protected school notice, calendar and staff communication services.
insert into public.school_apps
 (app_key,name,description,category,icon,app_url,app_kind,allowed_roles,allowed_job_titles,sort_order,is_active)
values
 ('school-notice-board','Staff Notice Board','Administrator-published staff notices targeted by role, scheduled and expiry aware.','School','📣','/school-services.html#notices','Internal',array['Admin','Teacher','Staff']::text[],'{}'::text[],180,true),
 ('school-calendar-events','School Calendar & Events','Internal school event calendar with administrator-controlled publishing and role-based audiences.','School','📅','/school-services.html#calendar','Internal',array['Admin','Teacher','Staff']::text[],'{}'::text[],190,true),
 ('staff-communication-hub','Staff Communication Feed','Text-first staff updates, comments and reactions restricted to active staff audiences.','School','💬','/school-services.html#staff-feed','Internal',array['Admin','Teacher','Staff']::text[],'{}'::text[],200,true)
on conflict(app_key) do update set
 name=excluded.name,description=excluded.description,category=excluded.category,icon=excluded.icon,
 app_url=excluded.app_url,app_kind=excluded.app_kind,allowed_roles=excluded.allowed_roles,
 allowed_job_titles=excluded.allowed_job_titles,sort_order=excluded.sort_order,is_active=true,
 updated_at=now();
