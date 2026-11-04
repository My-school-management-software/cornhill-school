

## 2026-11-04 — Jibble attendance source foundation
- Added `jibble_csv` as a distinct allowed source for attendance import batches and events; Jibble-imported events must be linked to an import batch, just like USB terminal imports.
- Applied the migration to Supabase and queried the live check constraints to verify the new source is accepted.
- Added replayable SQL at `supabase/migrations/202611040007_jibble_attendance_source.sql`.
- This is database preparation only: the current screen still imports the fingerprint-terminal CSV format, not a Jibble export. The Jibble parser/import UI must be built and tested against a real sample export before this can be called an operational Jibble integration.
- Jibble remains the primary time-tracking record. One fingerprint terminal at the main office remains a separate verification/import source until its exact model and export format are confirmed. No device API or direct Jibble-to-fingerprint connection is assumed.
- Production remains unchanged.
