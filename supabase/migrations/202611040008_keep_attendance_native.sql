-- Keep the attendance system fully native to Cornhill.
-- Jibble was a reference for product design only, not an external data source.
alter table public.staff_attendance_import_batches
  drop constraint if exists staff_attendance_import_batches_source_check;
alter table public.staff_attendance_import_batches
  add constraint staff_attendance_import_batches_source_check
  check (source = any (array['usb_csv'::text, 'manual'::text]));

alter table public.staff_attendance_events
  drop constraint if exists staff_attendance_events_source_check;
alter table public.staff_attendance_events
  add constraint staff_attendance_events_source_check
  check (source = any (array['usb_csv'::text, 'manual'::text, 'device_api'::text]));

alter table public.staff_attendance_events
  drop constraint if exists staff_attendance_event_source_batch_check;
alter table public.staff_attendance_events
  add constraint staff_attendance_event_source_batch_check
  check (
    (source = 'usb_csv'::text and import_batch_id is not null)
    or source <> 'usb_csv'::text
  );
