# CORNHILL Staff Fingerprint Attendance — Ready-to-Connect Plan

**Work area:** 5 — Staff attendance  
**Status:** Software preparation complete; physical device connection pending purchase and testing.  
**School context:** Approximately 30 staff; Windows 10/11 office computer; administrator-managed terminal; staff attendance visible according to role permissions.  
**Time zone:** Africa/Kampala (EAT, UTC+3).

## 1. Five terminal models to compare

These are standalone attendance terminals, not small USB fingerprint readers. Buy one terminal only. Specifications and capacities can differ by firmware, regional variant and bundle; insist on the exact model label and a live demonstration before paying.

1. **ZKTeco K40 / K40 Pro — recommended budget starting point.** Fingerprint attendance with TCP/IP and USB-host export; backup battery on listed variants. Uganda listings advertise the K40, with prices varying materially by seller and variant. Confirm whether the quote is K40 or K40 Pro and verify the exact capacity and firmware. [Regional K40 specification](https://zkteco.eg/KSeries/K40) · [Uganda supplier listing](https://www.proxi-solutions.com/asset-management/).
2. **ZKTeco K50 — compact alternative.** Fingerprint attendance terminal with TCP/IP and USB-host on listed variants. Confirm that the offered K50 firmware exports the required attendance log columns. [Regional K50 specification](https://zkteco.eg/KSeries/K50).
3. **ZKTeco MB20 — small-team alternative.** Fingerprint plus face/card options, TCP/IP and USB-host; published versions list a smaller fingerprint capacity than the K40/K50. Suitable for a small staff group if the exact unit supports the required export. [MB20 product details](https://zktecoua.com/en/products/mb20/).
4. **ZKTeco iClock680 — higher-capacity option with Uganda listing.** Fingerprint terminal with USB-host and TCP/IP; a Uganda product listing describes 8,000 fingerprints and 200,000 records. Confirm the actual optional connectivity on the quoted unit. [Uganda iClock680 listing and specifications](https://www.zkteco-uganda.com/zkteco-iclock680.html).
5. **ZKTeco SpeedFace-V5L — premium face/fingerprint option.** Face and fingerprint verification with network connectivity; likely more than required for an initial team of around 30. Check the exact V5L variant, firmware and attendance export support. [Manufacturer product page](https://www.zkteco.com/en/SpeedFaceSeries/SpeedFace-V5L-Series).

**Recommendation:** Start by obtaining a written quote and live demonstration for the ZKTeco K40/K40 Pro. Compare it with the iClock680 if you prefer a higher-capacity terminal and local supplier support. These are shortlist candidates, not a guarantee that every variant has already been tested with Cornhill.

## 2. Mandatory checks before purchase

Do not pay until the supplier demonstrates the exact unit being sold:

- Record the exact model/variant, serial number and firmware version.
- Enrol one test fingerprint and assign a unique staff/user ID.
- Demonstrate clock-in and clock-out events.
- Export a sample attendance file and show the raw columns: device serial, staff/user ID, timestamp, event type/status and unique log ID if available.
- Confirm whether export is via USB flash drive (USB-host), direct USB cable, Ethernet or Wi-Fi. **USB-host normally means a flash drive plugs into the terminal; it does not imply direct PC USB integration.**
- If network push/ADMS is advertised, demonstrate it end-to-end and confirm whether a licence, vendor cloud, local server or subscription is required.
- Demonstrate time-zone configuration, offline log retention and backfill after network restoration.
- Obtain warranty, installation, training and support terms in writing.

## 3. Setup instructions when the machine arrives

1. Connect the terminal to stable power. Prefer Ethernet to the office LAN when supported; use USB flash-drive export as the initial reliable fallback.
2. Set date/time and timezone to Africa/Kampala (EAT, UTC+3). Protect the terminal administrator menu with a private password.
3. In **Staff Attendance → Register machine staff IDs**, enter the terminal serial number and its numeric user ID, then map that ID to the correct Cornhill staff profile. Use one unique device user ID per staff member; do not rely on names for matching.
4. Enrol fingerprints on the terminal itself. Keep biometric templates on the device; do not upload fingerprint images or templates to Cornhill.
5. In **Staff Attendance → Work schedules**, create the school work patterns, start/end times, grace period, break allowance and working days. Assign a schedule to each staff member.
6. Export attendance logs from the terminal to a CSV file and upload them under **Staff Attendance → Upload attendance export**. The importer supports a staff ID, event type and either one timestamp column or separate date/time columns. Preview the records before importing.
7. Compare imported totals and several individual punches against the terminal's own report. Re-import the same export to confirm duplicate prevention.
8. Review the daily attendance summary, lateness, absence after grace, missing clock-outs and potential extra time. Potential extra time is a review item, not automatic approved overtime.
9. If the terminal/network fails, keep a signed manual register and submit administrator-approved corrections. The scheduled five-minute attendance check evaluates stored attendance; it does not itself communicate with the fingerprint device.

## 4. Cornhill software workflow already prepared

- Staff-to-device user ID mapping.
- Work schedules and staff schedule assignments.
- Administrator CSV preview/import workflow, including separate date/time columns and common Check In/Check Out aliases.
- Attendance event history, daily summary and attendance correction requests.
- Staff-facing attendance history and warning inbox.
- Five-minute scheduled attendance check.
- Automatic salary deductions remain OFF by default; do not enable them until the school has approved its attendance and payroll policy.
- Raw attendance events should remain auditable; corrections must not erase original device records.

## 5. Security and privacy

- Restrict device setup and attendance administration to authorised administrators/HR.
- Never place database keys, service-role credentials or device administrator passwords in the browser or on the terminal.
- Do not send fingerprint images/templates to the web application. Store only the device user ID and attendance event metadata required for school administration.
- Keep the device on a protected local network; do not expose its management ports directly to the public internet.
- Before enrolment, provide staff with a biometric-data notice, document the school's lawful basis and retention rules, restrict access, define dispute handling and provide an approved non-biometric fallback. Obtain appropriate Ugandan privacy/legal guidance.

## 6. Direct network integration — later adapter

A browser application cannot directly communicate with every USB or proprietary fingerprint terminal. Direct PUSH/ADMS/API integration requires the exact device model, firmware, vendor protocol documentation and a secured receiving adapter (for example, a protected gateway or server-side function). Implement this adapter only after the supplier proves the exact unit can send attendance events to a customer-controlled endpoint. Validate the device serial, user ID, timestamp and event type; make ingestion idempotent; preserve original event metadata; and test offline backfill and duplicate delivery.

## 7. Completion boundary

**Prepared:** attendance workflows, import path, settings guidance, five-model shortlist, staff ID mapping, schedules, reports and safety guidance.

**Pending until the school purchases a terminal:** physical connection, vendor SDK/API compatibility, direct network push, real-device CSV validation and pilot sign-off. Pilot with 3–5 staff for one working week before enrolling everyone.

This work area is marked **ready for device connection**, not physically hardware-tested.
