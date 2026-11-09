alter table public.staff_attendance_events
  add column if not exists dedupe_key text;

update public.staff_attendance_events
set dedupe_key = case
  when device_serial is not null and external_event_id is not null
    then 'external|' || device_serial || '|' || external_event_id
  when device_serial is not null and device_user_id is not null
    then 'event|' || device_serial || '|' || device_user_id || '|' ||
      event_type || '|' ||
      to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  else null
end
where dedupe_key is null;

create unique index if not exists staff_attendance_events_dedupe_key_unique
  on public.staff_attendance_events (dedupe_key);