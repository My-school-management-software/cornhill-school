# CORNHILL downloadable staff attendance kiosk — architecture decision

**Status:** Architecture approved for staged implementation; no phone biometric kiosk is claimed to be live or hardware-tested.

## Existing software to reuse

The central staff attendance workspace already contains:
- staff-to-device-user ID mappings;
- work schedules and schedule assignments;
- append-only attendance events;
- CSV/USB imports with idempotency support;
- staff self-service attendance history and correction requests;
- administrator review, attendance alerts and payroll attendance linkage.

The App Centre currently has an active `Staff Attendance Kiosk` registry row, but its URL points to the main school-management workspace with an attendance query parameter. It is not yet a separately installable kiosk app. Replace that destination only after the standalone kiosk and its server-side ingestion path pass preview tests.

## Product shape

Create a separately installable CORNHILL Staff Attendance Kiosk PWA for one school-owned, permanently stationed Android phone/tablet. It is a capture client, not a second staff directory or attendance database. It should have a companion Windows 10/11 browser kiosk route as an optional fallback.

The app must support:
1. QR credential scanning using the device camera.
2. NFC credential scanning on compatible Android devices.
3. A staff PIN fallback with rate limits and lockout controls.
4. A face-verification adapter only after an approved, tested on-device implementation and the school's privacy review.
5. A fingerprint-terminal adapter for a specifically supported external terminal/SDK. The normal Android biometric prompt authenticates the phone's enrolled owner; it does not identify arbitrary staff members, so it is not a shared staff fingerprint kiosk.
6. A clear clock-in/clock-out confirmation and a controlled rule for ambiguous or duplicate punches.

## Offline-first event model

- An administrator provisions the kiosk while online. Provisioning downloads only the minimum active staff credential directory and public verification material needed for offline verification; it must not download learner, payroll, finance or unrelated staff records.
- Each staff QR credential is signed by the server. The kiosk verifies signatures locally using a public key. Never trust a plain staff ID or unsigned QR code as proof of identity.
- Offline scans create append-only local event envelopes with a unique event UUID, device ID, credential subject, event type, capture timestamp, local sequence number and verification method. The device does not invent server receipt time.
- Encrypt the local queue at rest with a non-exportable device-bound key where supported. Keep the queue isolated from the main school's general browser storage. Clear it on device decommissioning only after a successful server reconciliation/export.
- When connectivity returns, submit queued events to a dedicated authenticated ingestion endpoint. The endpoint validates device registration, credential signature/expiry, event shape, clock skew, staff status, duplicate UUID and replay protection before inserting into `staff_attendance_events`.
- Preserve source metadata and idempotency keys. A repeated sync must not create a second event. Show pending, synced and rejected counts; never silently discard rejected events.
- If the device clock is unreliable, retain both captured device time and server receipt time and flag the event for review. Do not silently rewrite the original event.
- If the app is offline beyond credential expiry or the provisioned directory is stale, use an administrator-approved manual fallback rather than weakening identity checks.

## Sensitive biometric boundary

Do not store face images, face embeddings, fingerprint images or fingerprint templates in Supabase, Cloudflare R2, the general app cache or the offline event queue. Prefer QR/NFC/PIN for the first pilot. A biometric mode is a separately gated adapter and must keep matching on the approved device/terminal. Before enabling it, the school must obtain appropriate Ugandan privacy/legal advice, provide staff notice, define lawful basis and retention, limit authorised access, document alternatives and test spoof resistance. A biometric failure must not silently clock in the wrong person.

## Role and data boundaries

- Kiosk: capture only; cannot browse staff profiles, attendance history, payroll, learner records, finance or administrator tools.
- Staff account: can view only their own attendance history and submit corrections through the existing staff workspace.
- HR/authorised administrator: can provision kiosk devices, map device credentials, review exceptions and reconcile attendance.
- Director: oversight and approval according to the existing role matrix; no ability to impersonate a staff kiosk scan.
- Bursar: may consume approved attendance/payroll outputs only where the role matrix permits; no kiosk provisioning by default.
- Device credentials are separate from staff web passwords. Revoke a lost/stolen kiosk immediately.

## Rollout gates

**Gate A — QR/NFC/PIN pilot:** standalone PWA shell, secure device provisioning, signed QR credentials, protected ingestion endpoint, encrypted offline queue, idempotent sync, audit logs, App Centre link, install instructions and automated tests. Test with 3–5 authorised staff using dummy/test accounts for one week.

**Gate B — face adapter:** proceed only after local device capability, offline model distribution, spoof/liveness tests, privacy review and a non-biometric alternative are approved.

**Gate C — fingerprint adapter:** proceed only after purchasing the exact terminal, obtaining vendor protocol/SDK details and validating the terminal on the school's LAN. Keep the existing CSV/USB import as fallback.

## Explicit non-goals

- Do not copy Jibble branding, source code or proprietary services.
- Do not require a Jibble subscription.
- Do not claim every Android phone can identify arbitrary staff fingerprints.
- Do not put service-role keys, signing private keys or device secrets in browser JavaScript, manifests, QR payloads or Git.
- Do not make biometric templates a central school database field.
- Do not enable payroll deductions automatically based only on raw kiosk events.

## Current verified status

The database has an active App Centre entry named `Staff Attendance Kiosk`, but it currently opens the main workspace. The existing attendance acceptance-test note reports zero rows in the inspected attendance tables at that time and lists real workflow tests as pending. Physical fingerprint hardware is not connected. The separate downloadable kiosk, offline capture/sync, QR/NFC reader and face recognition are not yet implemented or verified.
