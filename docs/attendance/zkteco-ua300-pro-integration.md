# CORNHILL staff attendance: ZKTeco UA300 Pro integration plan

## Status

- Preferred candidate: ZKTeco UA300 Pro.
- Hardware purchased: No.
- Live connection: Pending.
- Existing CSV/USB attendance import: Retained as a fallback.
- No production attendance records or staff profiles are changed by this preparation.

## What is known, and what must be verified

Published UA300 Pro reseller specifications list a 2.8-inch display, up to 3,000 fingerprint templates, up to 50,000 attendance records, TCP/IP, Wi-Fi and USB-host communication. ADMS is described as remote management with BioTime. The official ZKTeco UA300 product family documentation describes TCP/IP, USB, SDK and ADMS support, but marks ADMS as optional on the UA300 family.

Therefore, do not assume every UA300 Pro unit has ADMS enabled or exposes the same firmware/protocol. Before purchase, ask the seller to confirm in writing:

1. Exact model name and hardware/firmware version on the supplied unit.
2. ADMS push support enabled on that unit, and whether any licence or BioTime subscription is required.
3. Whether a third-party system can receive attendance logs directly using ADMS, and whether ZKTeco provides the applicable protocol/SDK documentation.
4. Whether event direction (IN/OUT) is included in each attendance record.
5. Whether the unit supports local-network operation without a paid cloud subscription.

## Target design

1. An administrator creates/updates the staff profile in CORNHILL.
2. An administrator enrols the staff member's fingerprint directly on the terminal.
3. CORNHILL's administrator maps the terminal's numeric device user ID to exactly one staff account, including the terminal serial number.
4. The terminal sends attendance transactions over the school's local network to a small Windows service running on the office computer.
5. The Windows service validates the device serial, parses the supported event format, rejects malformed or duplicate events, and forwards normalized attendance events to a protected server endpoint over outbound HTTPS.
6. The server validates the device credential and mapping, records the event with its original timestamp and device metadata, and makes it available to the attendance dashboard.
7. CORNHILL displays a successful clock-in or clock-out confirmation. Optional spoken confirmation can be provided by the Windows office station if the school's browser/kiosk and audio setup support it.

The Windows bridge is necessary for a reliable LAN receiver and avoids exposing an unauthenticated attendance receiver directly to the public internet. The terminal should not be configured to send data to an arbitrary public endpoint until its protocol and security options have been verified.

## Attendance event rules

- Prefer the terminal's explicit IN/OUT event status when the model/firmware supplies it reliably.
- Do not silently assume that every first scan is clock-in and every second scan is clock-out. If explicit direction is unavailable, implement a documented daily state machine and flag ambiguous or repeated scans for administrator review.
- Preserve the raw device event timestamp, serial number, device user ID, verification mode and source event identifier where supplied.
- Apply duplicate protection so a retransmitted event cannot create a second attendance record.
- Use Uganda local time (EAT, UTC+03:00) consistently when displaying daily attendance and evaluating work schedules.
- Never automatically approve overtime or payroll deductions solely because a raw event arrived.

## Security and privacy

- Fingerprint images and biometric templates stay enrolled on the terminal; do not upload them to Supabase.
- The bridge must authenticate the terminal by registered serial and a per-device secret or another vendor-supported trust mechanism. Do not trust a serial number supplied by an arbitrary internet client as authentication.
- The bridge sends events only over HTTPS using a narrowly scoped device credential. Keep secrets out of browser code and Git.
- Keep the terminal on a trusted school LAN, restrict inbound firewall access to the bridge listener, and do not expose its management interface to the public internet.
- Do not weaken existing attendance-table RLS policies to make device writes work. Use a narrowly scoped server-side ingestion path with validation, audit metadata, deduplication and rate limits.
- Keep administrator review for corrections and ambiguous events.

## Purchase and installation checklist

- Confirm exact UA300 Pro variant and firmware.
- Confirm ADMS/SDK access and any subscription/licence requirement in writing.
- Confirm the device can transmit event direction and timestamps.
- Install terminal near the main office and connect it to the same trusted LAN as the Windows office PC.
- Reserve a fixed local IP for the Windows PC and configure firewall rules for the vendor-confirmed protocol port.
- Configure the terminal's ADMS/server destination only after the receiver has been installed and tested.
- Enrol one test staff account first; verify morning IN, evening OUT, duplicate retry, power/network interruption and recovery before enrolling all staff.
- Keep CSV export/import available during pilot and fallback.

## Current CORNHILL attendance capabilities

The existing attendance module already has staff-to-device ID mappings, work schedules, attendance summaries, incident review, correction requests and CSV import. The next implementation phase, after hardware/protocol confirmation, is the Windows bridge and protected event-ingestion endpoint. This document and the pending UI do not claim that live biometric clocking is already connected.
