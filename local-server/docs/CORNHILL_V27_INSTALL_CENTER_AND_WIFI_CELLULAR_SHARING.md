# CORNHILL V27 — independent public Install & Connection Centre

**Date:** 27 November 2026 (Africa/Kampala).
**Production URL:** https://cornhill-install-center.vercel.app/
**Vercel project:** `cornhill-install-center` (`prj_MKWLRxwDHUii61Cja8w22lRDgZAG`), under verified existing hobby team `cypher-projects1`.
**First deployment:** `dpl_43DKcHDxHhFzFFJfSpXub2jAnXju`, deployment state **READY**, production alias assigned, reported by Vercel tool. External browser reachability was not separately exercised because container DNS was unavailable.

## Director's new connectivity requirements

- A stable installation link the Director can distribute to approved staff.
- Windows and Android applications eventually transferable as actual installer **files**, through Bluetooth, Xender, USB flash drives, etc. The device must verify version and SHA-256 checksum and get its own staff or guardian credentials; installers must never bundle school data, backups, .env, private CA or staff codes.
- Staff should access the same authorised school data over approved school Wi-Fi **or** cellular data (not only the Wi-Fi near the Director's laptop).
- **Goodlife Wi-Fi is not school-owned**. The V26 exact-phone gate must stay OFF there. No inbound firewall permissions or 4175 gateway.
- Distinguish distribution (copying an installer) from live access (requires an Internet-reachable authenticated service or verified school LAN server) and offline queue synchronisation.

## Actual release state (not a misleading installer URL)

The separate Vercel project hosts only a small static, privacy-safe installation directory with 3 capabilities:
1. **Existing online school site**: links to `https://cornhill-school-swart.vercel.app/` (Vercel-confirmed current production alias on the distinct existing `cornhill-school` project; commit `247d12a2`). This **does not promise latest Windows source parity**, and hosted school financial postings are **NOT reconciled** with the local PostgreSQL 17 records. Do not enable financial sync or duplicate postings.
2. **School Wi-Fi gateway**: clearly marked **NOT YET AVAILABLE**. Existing local HTTPS `localhost:4174` works on the computer only. 4175 had not been running at V25; V26 refused unapproved network address and certificate SAN mismatch.
3. **Windows EXE / Android APK downloads**: clearly marked **NOT YET RELEASED**. There is an existing Director desktop EXE installation and newer-source Windows packaging scripts, but **no verified publicly distributable signed EXE/APK** has been approved or uploaded. Do not invent download links or repackage V22/V26 test ZIPs as production installers.

The distribution page collects **no credentials** and contains **no student records, confidential certificates, or payment information**. It is not an account-administration panel; publishing new versions must go through an authenticated Director-controlled release approval process.

## Future staged implementation (separate acceptance gates)

1. Build/test signed standalone Windows installer and Android APK from approved **actual newer Windows source**, with safe read-only launcher and HTTPS trust, no embedded database or production secrets.
2. Publish **immutable versioned packages + SHA256SUMS + release notes + signature verification** to the installation centre, with a Director-only authenticated publishing workflow. Keep production download button disabled until checks pass.
3. Verify an actual *school-controlled* Wi-Fi router and stable server reservation, install a matching CORNHILL TLS SAN and safe gateway, approved school phone trust and per-IP firewall trial.
4. Make the Internet-hosted site and local backend use a safe authoritative data design with an accepted offline queue, full session isolation, conflict handling and immutable finance reconciliation. Mobile cellular cannot call `localhost:4174` on the Director's Windows computer; do not open the local computer directly to the public Internet without a separately approved secure architecture.
5. Independently run 2+ real devices and 30+ concurrency acceptance including teacher, Headteacher, DOS, Bursar, Guardian and offline/online transitions. **Formal five release blockers remain 0/5 cleared.**

The Vercel installation centre is a **separate static project**: no deploy to `cornhill-school` production or the live school database was made as part of V27.
