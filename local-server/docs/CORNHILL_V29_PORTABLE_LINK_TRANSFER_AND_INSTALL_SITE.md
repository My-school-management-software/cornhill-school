# CORNHILL V29 — Live transfer ZIP and on-line installation centre

Date: Friday, 27 Nov 2026 (EAT). User asked: **Create a ZIP for download/save/share. Once extracted, it should open a browser link to the installation centre; it should eventually allow downloading live and local Windows/Android apps and syncing approved data and updates.** They also previously asked to withhold the final bookmark/save directive until the **actual installers** are complete.

## Completed in the current interaction

1. Created **`CORNHILL-V29-PORTABLE-LINK-STARTER.zip`** on the assistant artifact filesystem, 6,043 bytes, SHA-256 `1faffb5b28ddd4bbeb8701c6826efc6f5496e96b33ddefd9e356680e8637cba3`. ZIP integrity checked; 8 entries; 7 file hash entries independently verified.
2. The ZIP extracts a single `CORNHILL-TRANSFER-STARTER` directory. `START-HERE.html` is a portable, standalone HTML link page that works locally on Windows or phones without installed CORNHILL; contains only official HTTPS links, no learner, guardians, payments, passwords, secrets, certificates or databases. Three Windows `.url` shortcuts open:
   - Existing hosted school site: `https://cornhill-school-swart.vercel.app/` (Internet/mobile data; authenticated account needed).
   - Existing loopback local school server: `https://localhost:4174/` (**same Windows server PC only**).
   - Public install centre: `https://cornhill-install-center.vercel.app/`.
   - Read-me, `RELEASE-STATUS.json`, `SHA256SUMS.txt` and optional read-only PowerShell file-integrity checker.
   - No Windows EXE or Android APK or auto-sync is inside this ZIP.
3. Updated the existing **separate** Vercel installation-centre project `cornhill-install-center` (not the live `cornhill-school` project). Production deployment **`dpl_7Xb5V9VgpyxLb3YS8f8GZ4fypSbJ`** reported **READY**; the stable `cornhill-install-center.vercel.app` production alias remains assigned. Vercel source file inventory confirms 5 files, including `src/downloads/CORNHILL-V29-LINK-STARTER.zip` (a shorter, portable quick-start archive of 3 official browser destinations), `src/release*/catalogue.json` (in actual source: `src/releases/catalogue.json`), `src/index.html`, `src/style.css`, `src/vercel.json`. The catalogue lists the V29 zip as **browser-links-not-app**, with Windows EXE and Android APK `NOT_RELEASED`.
   - Note: The installed centre's public GET/download response was **not separately browser-tested**; Vercel API confirms deployment READY, alias assignment and source file presence. Conduct public browser download/ZIP integrity acceptance separately.
4. All distribution material is safe to transfer via Bluetooth, Xender, USB, messaging or flash disks, with the qualification that **only the links transfer, not the actual application or school database**. School account sign-in stays mandatory.

## Explicitly NOT completed; do not overclaim

- The signed, portable Windows standalone EXE and real accepted Android APK do **not** exist as verified distribution assets. The Director machine's current Electron app depends on its installed local-server/node/PostgreSQL structure; the Nov26 source archive contains no built EXE or APK. Native Android skeleton exists on a separate, older GitHub branch and has not passed physical acceptance.
- Both online + local data synchronization is **NOT ACCEPTED**. The hosted and local financial Posted receipts differ; do not automate or manually copy finance postings until reconciled, idempotency and provenance checks pass. A shareable browser starter or downloadable EXE cannot resolve authority and merge conflicts.
- Local HTTPS `localhost:4174` is loopback-only; no real school-owned LAN is yet configured. Director says `Goodlife` Wi-Fi is NOT school-owned; do not reopen 4175 or use its old IP/certificate.
- Auto-updating web directory means the *online information and download listings* can change centrally; it does not silently update extracted ZIP, installed EXE or APK, nor synchronize a local PostgreSQL 17 database.
- Full five release gates remain **0/5 formally cleared**.

## Next engineering milestones

Build the latest-current-source Windows portable client **and** a signed Android client that can authenticate to an appropriate school-managed server (hosted for cellular, verified school Wi-Fi for local). Test packaging on a clean Windows PC and separate Android phones. Approve an authenticated, Director-only release process backed by real published signatures/hashes. Complete cross-site row versioning, offline draft outbox, server-validated conflict resolution and finance reconciliation. Only then enable genuine EXE/APK download buttons and a real auto-update/sync workflow. Do not publish any direct link that presents a browser shortcut ZIP as an actual school application.

**User instruction:** Do not give the FINAL SAVE/BOOKMARK directive until native installers and secure access/sync are truly completed and accepted.
