# CORNHILL V24 — bounded real-local HTTPS and 35-client acceptance

**Date:** 27 November 2026 (Uganda).

**Purpose:** Substantive read-only acceptance against the *current installed Windows service* for the hosted-dependency and multi-device release gates, without applying older GitHub code over newer Windows modules.

## Private user-distributed source-independent package

`CORNHILL-V24-LOCAL-SECURITY-AND-35-CLIENT-ACCEPTANCE.zip`

The ZIP contains a Windows PowerShell entry, Node 24+ source, and 11 unit safety tests. It checks only `https://localhost:4174`, using Node's **system certificate store** (`--use-system-ca`) without bypassing TLS hostname/trust checks. No DNS to cloud services, HTTPS firewall rules, database connections, client credentials or learner identifiers are used.

The single batch:
1. Authenticates the local HTTPS service's public identity and security headers; distinguishes health from release readiness.
2. Confirms 11 public workspace shells are served locally, including Academics, School Office, Staff Operations, Bursar and Guardian.
3. Confirms a private session query with no cookies is rejected (401/403).
4. Tests **35 bounded simultaneous anonymous GET requests** to the local health endpoint *from one Windows PC*. This is load evidence only; it is NOT 35 distinct school devices.
5. Returns aggregate results and the exact five-release-gate blocker codes; preserves accurate blocked status.

## Verification and limitations

- **11/11 synthetic Node safety tests passed** in the offline construction environment (Node 22).
- The same actual Node HTTPS client code was exercised against a synthetic local HTTPS server: a properly trusted `localhost` test certificate passed **35 concurrent health GET + 11 public shell + session denial**. Without the test certificate trusted, TLS verification **failed closed**. The temporary private TLS test key was **not packaged or committed**.
- **The real Director Windows acceptance has NOT YET RUN.**
- The tool intentionally does not touch PostgreSQL, real payments, passwords, installed EXE, Vercel, firewall, Wi-Fi, LAN certificates or phone trust.
- 35 requests from one PC do not establish physical multi-device acceptance. Staff/guardian sign-in isolation, 30+ devices, offline synchronization and LAN access on a school-controlled router still require independent acceptance.
- Full release status remains **0/5 formally cleared**.

## Latest academic continuity evidence

The Director's V23 test-year removal returned `CORNHILL_V23=TEST_YEAR_REMOVED` and exactly one 2027 test record removed. Backup catalogue was verified but **not restored**. The 2026 year has 1 Term 3, 169 assessments, 1,991 saved marks and zero report-card snapshots. Neither the year/term status issue nor teacher marks end-to-end acceptance has been formally cleared.

**Do not merge the older draft PR into the newer Windows source; V22 was updated separately on-device and should be preserved.**
