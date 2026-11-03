# Cornhill Staff Fingerprint Attendance — Device Selection and Integration Plan

**Status:** Preferred candidate selected for evaluation; not purchased and not yet integrated.
**Staff estimate:** Approximately 30 people.
**Preferred candidate:** ZKTeco UA300 Pro (subject to supplier demonstration and written compatibility confirmation).
**Development branch:** `feature/cornhill-v3-foundation`.

## 1. Why this candidate

The Uganda product listing for the UA300 Pro describes:
- 3,000 users and 3,000 fingerprint templates;
- 50,000 attendance records;
- 2.4 GHz Wi-Fi, TCP/IP and USB-host connectivity;
- ADMS remote data management with BioTime;
- built-in backup battery.

These are vendor-listed specifications, not an independent test. Capacity is far above the school's initial estimate of 30 staff, leaving room for growth. Confirm the exact model and firmware on the quotation; do not accept a similarly named UA300/UA300 Pro substitution without checking its datasheet.

## 2. Mandatory purchase acceptance checks

Do not pay until the supplier demonstrates all of the following on the exact unit being sold:

1. Photograph or record the model label, serial number and firmware version.
2. Enrol a test fingerprint and assign a staff ID that can be matched to a Cornhill staff record.
3. Perform clock-in and clock-out punches.
4. Show the raw attendance event export, including device serial, staff/user ID, event timestamp, event type/status and any unique log ID.
5. Demonstrate automatic event upload using the device's ADMS mode to a customer-controlled test endpoint, OR provide the official SDK/API documentation and a working integration demo.
6. Confirm whether ADMS is enabled in the quoted firmware and whether BioTime, a licence, cloud service, subscription or local server is additionally required.
7. Demonstrate reliable time/date configuration, timezone handling (Africa/Kampala / UTC+3), duplicate event behaviour, network loss and automatic retry/backfill after reconnection.
8. Confirm USB export is available as a fallback and provide the exact export format.
9. Provide warranty, installation, training, support contact and total price in writing.

A statement that the device supports Wi-Fi or ADMS is not, by itself, proof that it can send events directly to Cornhill's application. The integration must be demonstrated end-to-end.

## 3. Intended integration architecture

- Staff are created in Cornhill with a unique immutable staff identifier.
- The same identifier is assigned as the device's user ID. Names on the terminal are optional and should not be treated as the matching key.
- Device events are received by a dedicated authenticated ingestion endpoint (for example, a Supabase Edge Function or a small secured gateway), not by exposing database credentials on the terminal or in the browser.
- The ingestion service validates the device serial against an administrator-approved device registry, validates payload shape and timestamp, maps the device user ID to a staff record, and stores the original event metadata needed for audit.
- Enforce idempotency using device serial plus vendor log/event identifier where available. If the device supplies no stable event ID, define and test a carefully scoped deduplication key; do not silently discard legitimate repeated punches.
- Store raw event time in UTC with the device timezone/offset captured; display local school time in Africa/Kampala.
- Derive attendance sessions (first clock-in, last clock-out, breaks, late/early status) from raw events using configurable shift rules. Never overwrite raw events when an administrator corrects a timesheet.
- If the network is down, the terminal should retain logs; verify later backfill. USB import is a controlled fallback with import batch, source file hash, operator and audit record.
- The browser app must never receive biometric templates or device administrative passwords.

## 4. Privacy and security

- Do not copy fingerprint images or biometric templates into Supabase or the browser app.
- Keep device administration restricted to authorized administrators/HR personnel.
- Record who enrolled/deactivated a device user and who corrected attendance.
- Provide a documented non-biometric fallback (PIN/card or authorized manual correction) for exceptions and device failure.
- Before enrolment, the school should document its lawful basis, staff notice/consent process as applicable, access restrictions, retention period and process for handling disputes. Seek appropriate local privacy/legal guidance for biometric employee data.
- Keep device network access isolated where practical. Do not expose the terminal's management port to the public internet. Use outbound secure upload or a protected local gateway where supported.

## 5. Software delivery phases

### Phase A — device-independent attendance foundation
- Staff attendance profiles and staff ID mapping.
- Shift and attendance policy configuration.
- Manual/admin-approved clock-in/out and exception correction.
- Immutable raw attendance event ledger and audit history.
- Daily/monthly timesheets, lateness and absence reports.
- Role-based access: staff can view their own records; authorized managers can view assigned staff; HR/admin can manage policies and approved corrections.

### Phase B — hardware adapter
- Implement only after receiving exact model, firmware, protocol documentation and a successful supplier demonstration.
- Build a device registry, authenticated event ingestion, event validation, idempotent import and device health monitoring.
- Test offline buffering/backfill, duplicate delivery, clock drift, daylight/timezone handling, invalid staff IDs and tampered requests.

### Phase C — school pilot
- Pilot with 3–5 consenting staff before enrolling all staff.
- Compare terminal logs against a manual timesheet for at least one working week.
- Resolve mismatches before enabling payroll calculations.
- Train an administrator and define a fallback procedure.

## 6. Procurement references

- ZKTeco Uganda UA300 Pro listing: https://www.zkteco-uganda.com/zkteco-ua300-pro.html
- ZKTeco official UA300 product page (note: UA300 is not automatically identical to UA300 Pro): https://www.zkteco.com/en/UASerieszRl/UA300
- Obtain the current UA300 Pro datasheet and a written quote from the supplier before purchase.

## 7. Explicit non-claims

At this stage, Cornhill has **not** purchased a fingerprint terminal, tested a physical device, enabled ADMS, or deployed a biometric integration. The selected model is a candidate, not a guaranteed compatible device. Attendance features and hardware connectivity must be implemented and tested in later development phases.
