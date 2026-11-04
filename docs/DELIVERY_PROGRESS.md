

## 2026-11-04 — Jibble attendance source foundation
- Added `jibble_csv` temporarily while interpreting Jibble as a data source; this was contrary to the intended product direction and was corrected immediately.
- Corrective migration `supabase/migrations/202611040008_keep_attendance_native.sql` was applied. Live constraints were queried and verified: import sources are now `usb_csv` and `manual`; event source also retains the future `device_api` option. No Jibble source remains accepted.
- Jibble is a product-design reference only. Cornhill will not depend on Jibble, import Jibble data, connect to Jibble APIs, or require a Jibble account.
- Product design lessons to implement natively in Cornhill: one-tap staff clock-in/out, a shared main-office attendance terminal, identity verification using the single fingerprint device, shift schedules, break tracking, late/early/absence flags, overtime calculations, leave requests and approvals, timesheet review/locking, role-based manager permissions, audit trail, and exportable attendance reports.
- Keep the school's single fingerprint terminal connected to the main office computer. Device model/driver/export format must be confirmed before direct device integration is claimed.
- No production deployment was made.

## 2026-11-04 — Native staff work schedules
- Added native work schedule configuration to the Cornhill attendance screen: schedule name, start/end times, late grace minutes, break allowance, and working weekdays.
- Added staff-to-schedule assignments managed by administrators and read-restricted so each staff member can only read their own assignment.
- Created and applied Supabase migration `202611040009_native_staff_work_schedules.sql`; both tables have RLS enabled and explicit authenticated-role grants (new public tables are not automatically exposed through the Data API).
- This milestone does not yet calculate lateness, absences, overtime, or payroll; it also does not enable phone-based clocking or claim fingerprint-device compatibility. Those require subsequent workflow work and confirmation of the exact fingerprint terminal model/protocol.
- Jibble remains design reference only; no Jibble account, API, or import path is used.
- Production remains unchanged.

## 2026-11-04 — Schedule-based daily attendance dashboard
- Added a daily dashboard using assigned active schedules and Uganda-local calendar day: expected staff, present, late arrivals (after configured grace), absent after grace, and missing clock-outs.
- Added a staff-by-staff daily review table and retained the 14-day event history.
- Absence is intentionally marked only after the scheduled start plus grace period; status is a review aid, not an automatic payroll or disciplinary decision.
- The live attendance events table currently contains no events, and no staff schedules are assigned yet; dashboard calculations are implemented but cannot be validated against real attendance activity until school data is entered.
- The preview is generated from the development branch only. Production remains unchanged.


## 2026-11-04 — Repair application startup and restore full demo initializer
- A source-level JavaScript syntax check exposed two literal escaped newline sequences between function declarations in the main inline script. These prevented the browser from parsing the application script, so later function declarations (including `enterDemoMode`) were unavailable.
- Replaced the two literal backslash-n sequences with actual line breaks. The complete inline application script now passes a JavaScript parse/syntax check using the JavaScript engine.
- Removed the temporary standalone demo fallback and reconnected the demo button to the native `enterDemoMode()` initializer, with a visible startup error if it fails.
- Commit: `189b203` fixes the syntax error; follow-up commit `4a4b971` restores the native demo flow.
- Not yet browser-tested on Android. A Vercel deployment attempt was blocked by the team's 24-hour deployment API limit; no new preview is available for this correction yet. Production remains unchanged.
