# CORNHILL Attendance Terminal — app and integration plan

## Purpose

The Attendance Terminal is a separate installable Progressive Web App (PWA) listed in the CORNHILL App Center. It runs on an authorised Android phone, tablet or Windows computer. It is a capture client only; the CORNHILL Main System remains the source of truth for staff identities, schedules, attendance policy, incidents, approvals and payroll.

## Current implementation boundary

- The standalone PWA shell and App Center listing are created.
- The app detects browser support for QR scanning, Web NFC and platform authenticators.
- It includes a local UI capability check for camera/NFC and an install prompt.
- The app is not paired to Supabase and cannot read staff profiles or submit attendance events.
- Clocking controls remain locked; no test or demo attendance records are created.
- Offline caching stores only the app shell. An attendance event must be confirmed by the Main System online before it is considered recorded.

## Director controls planned in the Main System

The Director will choose the active method and may change it for a policy period. The approved method and effective date are stored in the Main System and supplied to paired terminals. Terminal users cannot override the Director's choice.

Supported method families:

1. QR badge: a school-issued, revocable random token, scanned by the terminal camera. The QR value must not expose a staff name, pupil code, phone number or salary data.
2. NFC card/tag: a revocable random card token. NFC is the card/tag technology; it is not a fingerprint or facial identity by itself.
3. Phone face/fingerprint: the phone's secure platform authenticator/passkey can verify the signed-in staff member on that person's own device. It does not turn one ordinary phone fingerprint sensor into a multi-person staff identification reader.
4. External biometric machine: a supported fingerprint or face attendance terminal recognises the enrolled person locally and exports a staff device ID plus event metadata. Integration uses a verified vendor protocol, local Windows bridge, or controlled export/import.
5. Director kiosk/manual fallback: remains available for authorised correction or continuity use according to the school's approval process.

A policy can select one primary method and, where the Director allows it, one fallback. Every change is auditable with who changed it, when it takes effect and which terminal(s) it applies to.

## Device integration boundary

- Generic browser code cannot access every USB fingerprint reader, proprietary face terminal or vendor-specific protocol.
- A local Windows bridge may be required for TCP/IP, USB-host, serial, Bluetooth or vendor SDK integration.
- Vendor adapters must authenticate the device, validate the staff/device mapping, validate event timestamps and event type, deduplicate imported events and preserve the raw source reference.
- CSV/USB import remains an important fallback for machines that export attendance logs but do not support a customer-controlled push API.
- Do not put Supabase service-role keys or vendor administrator passwords in the PWA/browser.

## Biometric privacy and safety

- Keep fingerprint templates and face templates on the biometric device or within its protected authenticator; do not upload raw templates or face images to the school database.
- The Main System should retain only the attendance event, staff reference, method, device reference and audit metadata required for school administration.
- Provide staff notice, approved lawful basis and retention rules, controlled access, a dispute process and a reasonable non-biometric alternative before biometric enrolment.

## Installation

1. Open **App Center → CORNHILL Attendance Terminal** in Chrome on the authorised Android device or Edge/Chrome on Windows.
2. Choose **Install app** when the browser offers it, or use the browser menu's **Install app / Add to Home screen** option.
3. Keep the device online during first setup.
4. Pair it from the Director's authorised controls in the Main System once those server-side controls have been deployed.
5. Do not use the locked clocking controls for real attendance until a pairing test and a successful server-confirmation test are completed.

## Hardware compatibility status

An earlier CORNHILL plan names the ZKTeco UA300 Pro as a candidate, but no unit has been purchased or physically connected. Existing CSV/USB import remains available. Direct integration with any fingerprint/face machine depends on the exact model, firmware, licensed features and vendor protocol. The adapter must be tested against the actual unit before enabling it.

## Next engineering phase

Add Director-managed capture-method policy, terminal pairing/revocation, narrowly scoped event ingestion and a common device-adapter contract. Then test QR, NFC and platform-authenticator paths on the actual devices, followed by a vendor-machine/USB export pilot. Only after those checks should the clocking controls be unlocked.
