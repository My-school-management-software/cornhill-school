# CORNHILL V25 — source-independent staff authentication & LAN readiness

**27 November 2026 (EAT).** The Director has already confirmed Windows V24 live read-only HTTPS concurrency acceptance (`CORNHILL_V24=PASS`), including 35 bounded anonymous loopback health requests, 11 public shells and OS-trusted TLS. No real staff-role sign-in or separate-device session acceptance has yet been carried out.

V25 is an independent Windows ZIP `CORNHILL-V25-STAFF-ACCESS-AND-LAN-READINESS.zip` distributed to the Director, *not* a replacement of the newer local app source. Package SHA256: `7de04324ad3b9c5adc9f2feb27cae8605256fb8bb811b7a06f7fbe0d3433b007`.

## Implementation

- Verify **18 installed-source role-selection policy cases**, including allowed Director, Teacher, Headteacher, Deputy Headteacher, DOS, Bursar, Deputy Bursar, Other Staff cases and unsupported/privilege-escalation denials. Import the installed `src/security/staff-login-role-policy.mjs` dynamically; do not assume the outdated GitHub branch matches the user's current Windows source.
- Verify **10 protected GET API endpoints** deny a completely anonymous HTTPS request (401/403), including session, school catalogue, learners, academics, finance, staff operations, staff leadership, guardian and role administration.
- Verify **3 login endpoints** are POST-only. The script **does not POST** any login credentials, doesn't attempt guessed passwords or create account lockouts.
- Verify staff + guardian public sign-in shells, trusted certificate/hostname, exact CORNHILL health/readiness identity and release blockers.
- Read-only Windows listener inventory confirms port 4174 is loopback-only; records port 4175 private-interface status **without touching firewall or certificates**, and **without claiming the LAN is school-controlled**.
- Include an **offline local HTML checklist** for the Director to *manually* record Authorised Director/Teacher/Leadership/Bursar/Guardian sign-in and separate-phone results, without recording credentials, learner records or phone addresses. The human checklist only records PASS/BLOCKED/NOT TESTED; it is not itself authentication verification.

## Verification and release honesty

**17/17 deterministic Node unit safety tests PASS** in the packaging environment. Actual reviewed Nov26 Windows-source snapshot passes **18/18 role-policy cases**, but actual live Windows V25 execution is **pending**. Source-independent scripts have no permissions to change PostgreSQL, staff accounts, school fees, marks, firewall, cloud, Windows EXE or local HTTPS server configuration.

**Not accepted by V25 alone:** authorised real staff logins, per-role class/finance isolation, 2 physical phones, school-controlled network certificate/firewall scope, 30+ real devices, durable offline mark sync, finance cloud reconciliation, final release. All **5 formal release blockers stay pending** until independent real school evidence.

The earlier V18/V19 pilot was locked to specific observed SSID/IP. V25 deliberately does not reuse those now-stale network assumptions, set broad inbound firewall access or turn on sync. Director confirmation that the physical Wi-Fi belongs to the school is required before any further LAN exposure.
