# CORNHILL V26 — Independent role acceptance and exact-one-phone LAN candidate

**27 November 2026.** Built for the actual newer Windows installation; **does not overwrite that source**. The Director has already confirmed a Teacher can sign in, view their assigned class, and is denied both Director controls and other classes. V25 verified **the existing Windows 4174 HTTPS listener remains loopback-only and the 4175 LAN gateway is not running**.

## Distribution

File: `CORNHILL-V26-STAFF-ROLES-AND-ONE-PHONE-LAN-PILOT.zip` (independent, pre-reviewed Windows ZIP).

SHA256: `e19cf2acdba2e579de3fcbf5aa4fef63d068ee93c9986bd5e654f35c1dc554ae`.

This package contains a default **READ-ONLY** Windows entry script and an offline, credential-free role checklist. The checklist covers Director, Teacher, Headteacher, DOS, Bursar, Deputy Bursar, Guardian, finance-role isolation, verified school network ownership and actual second-device access. It NEVER performs sign-in. Any PASS values recorded by the Director are human observations, not API-level proof.

The read-only LAN review discovers current active Wi-Fi and actual SSID instead of reusing stale earlier V18/V19 hard-coded Wi-Fi assumptions. It requires Windows Public firewall inbound BLOCK, a private Wi-Fi IPv4, no other 4175 listener/allow rule, loopback-only 4174, a matching LAN public certificate SAN, and a TLS-trusted upstream on `localhost:4174` with the **same pinned existing upstream CA** the gateway will use. It reports all remaining formal gate codes. If any preflight fails, fail closed, no changes.

**Optional pilot (OFF by default):** Only a school-authorised Director in an elevated PowerShell session, on a network they explicitly confirm the school controls, may type a network ownership phrase and an approval phrase, identify **one** approved school-managed Android phone IPv4 in the current /24, and privately enter the existing PFX passphrase. It then opens a temporary firewall allow rule scoped to one remote phone IP and exact host IP:4175, and starts a standalone HTTPS reverse proxy from the approved phone to the existing loopback 4174 service. The proxy itself also checks the **exact client IP** in addition to restrictive CIDR, Host, Origin, CSRF, header, request-body and TLS-to-upstream restrictions. No credentials are sent to the assistant or written to disk. Cleanup uses `finally`, with separately gated `-StopFirewall` after an abnormal exit.

**Risks:** A school-managed phone must already trust the CORNHILL public CA; trust must be provisioned by school IT, not by bypassing browser warnings or sharing the PFX/private CA. Never use a public/shared network or real school payments for this pilot. If the IP or Wi-Fi changed or certificate/CA is missing, STOP. The one-phone pilot is NOT proof of 30+ devices or offline sync.

## Verified development tests

- 27/27 deterministic Node security/safety unit tests PASS in the build container.
- 1/1 synthetic TLS-integration tests PASS using a fresh synthetic CA, isolated HTTPS backend and gateway. The synthetic test private key was **not included** in the distributed ZIP.
- The package ZIP passed archive integrity validation and contains only public test fixtures / source; no live records, private certificate or school credentials.
- **Real Windows V26, optional one-phone pilot, Headteacher/DOS/Bursar/Guardian authentication and multi-physical-device isolation are NOT yet verified.**

Cloud/live payments still must not be synchronized because the separate posted-payment mismatch remains unresolved. **Formal five-release-blocker acceptance: 0/5**.

Do NOT merge the older development branch into the newer Windows source. V22 academic UI source update and V23 exact one-row test-year deletion already succeeded separately on Windows.
