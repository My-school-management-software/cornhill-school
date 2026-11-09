-- Make USB attendance imports idempotent even when terminal exports omit event IDs.
-- Existing event-ID imports already have their own partial unique index.
create unique index if not exists staff_attendance_device_event_fallback_unique
on public.staff_attendance_events(device_serial, device_user_id, event_type, occurred_at)
where device_serial is not null and device_user_id is not null and external_event_id is null;

comment on index public.staff_attendance_device_event_fallback_unique is
'Prevents duplicate USB attendance events when a terminal CSV has no stable event ID.';
