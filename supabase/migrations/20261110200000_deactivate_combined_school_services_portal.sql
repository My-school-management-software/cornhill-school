-- The former combined portal is replaced by dedicated single-purpose applications.
-- Keep the historical registry row but make it unavailable from the App Centre.
update public.school_apps
set is_active=false,updated_at=now()
where app_key='school-services-hub';
