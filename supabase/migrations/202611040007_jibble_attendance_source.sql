-- Permit Jibble-exported attendance batches/events as a distinct source.
-- The CSV parser/import workflow is implemented separately once the school's
-- actual Jibble export format has been confirmed.
alter table public.staff_attendance_import_batches
  drop constraint if exists staff_attendance_import_batches_source_check;
alter table public.staff_attendance_import_batches
  add constraint staff_attendance_import_batches_source_check
  check (source = any (array['usb_csv'::text, 'jibble_csv'::text, 'manual'::text]));

alter table public.staff_attendance_events
  drop constraint if exists staff_attendance_events_source_check;
alter table public.staff_attendance_events
  add constraint staff_attendance_events_source_check
  check (source = any (array['usb_csv'::text, 'jibble_csv'::text, 'manual'::text, 'device_api'::text]));

alter table public.staff_attendance_events
  drop constraint if exists staff_attendance_event_source_batch_check;
alter table public.staff_attendance_events
  add constraint staff_attendance_event_source_batch_check
  check (
    ((source = any (array['usb_csv'::text, 'jibble_csv'::text])) and import_batch_id is not null)
    or (source <> all (array['usb_csv'::text, 'jibble_csv'::text]))
  );
