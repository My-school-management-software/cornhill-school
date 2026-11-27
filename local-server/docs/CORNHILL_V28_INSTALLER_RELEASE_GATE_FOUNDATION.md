# CORNHILL V28 — Installer Release Gate Foundation (27 November 2026)

The Director requested **completion of the software distribution hub before a final saving/bookmark directive**, not more premature PowerShell setup steps. The installation centre production link was deployed at https://cornhill-install-center.vercel.app/ but it is *only an installation directory*, **not a completed Windows/Android distribution system**.

## Verified code work done now

Developed an independent Node 22-compatible `release-catalogue.mjs` library and deterministic safety tests in a standalone `CORNHILL-V28-RELEASE-GATE-FOUNDATION.zip` package. **20/20 automated tests pass.** The library:
- Has a **pending** default catalogue with NO EXE/APK hyperlinks.
- Refuses official release metadata unless Director approval, signed-build verification, clean Windows and physical Android acceptance, local/cloud data parity, **finance reconciliation**, offline synchronization, user role isolation and multi-device acceptance are all separately marked PASS.
- Requires named Windows EXE and Android APK to match reviewed SemVer and known SHA-256 signer fingerprints, prohibits suspicious names/directory traversal, enforces file-size limits, rejects modified content by SHA-256, rejects symlinks and checks basic PE/ZIP file signatures.
- Constructs only **same-origin** versioned package paths. It does **not** automatically publish to Vercel, perform unauthenticated upload, request a school password, change a school database or assert that a fake synthetic test file is truly a signed installer.

**Limitations:**
- Tests of fake PE/APK buffers do *not* verify true EXE/APK functionality, publisher signature or external-device access. Signer fingerprints/status supplied in release metadata must still be independently verified by a trusted server-side publishing workflow before approval.
- User's latest inspected Windows source (Nov26 snapshot) has `electron-builder` scripts to create Windows EXE, but the existing desktop shell expects `C:\Users\...\cornhill-school\local-server` with native Node, PostgreSQL 17, a locally pinned certificate root and startup scripts. **Publishing this EXE by itself as a “works on any computer” installer would be incorrect.**
- Android project exists in `native/cornhill-shell` on GitHub but was not included in the Windows source-review ZIP; actual signed APK and physical phone acceptance are not available.
- The current Goodlife Wi-Fi was rejected by Director as NOT school-owned. No public LAN service should be enabled there.
- Historic cloud/local Posted finance allocations are unreconciled, and local offline queue release is not accepted. Do NOT enable real financial synchronization.
- Formal release gates remain **0/5** cleared. Do NOT tell the Director to finally save/share an incomplete link as the finished installer centre.

## Required next implementation milestones

1. Implement and review real Windows client distribution: installer must include or securely discover an authorised backend without copying production .env, database or certificates, and verify portability on a separate clean Windows PC.
2. Implement and review native Android install/build signing; verify physical device and automatic updates.
3. Resolve cloud/local record authority, offline conflict resolution, finance ledger reconciliation and role-isolated Internet/mobile-data access independently.
4. Deploy approved versioned assets to the installation centre with authenticated Director-only publishing and server-side signed-package verification; only then enable EXE/APK buttons.
5. Validate school-owned Wi-Fi (not Goodlife), mobile data, separate devices, storage/permissions, end-to-end academic+finance and multi-device acceptance.
6. After complete release verification, give one clear saving/home-screen instruction for the permanent URL, including Bluetooth, Xender, USB distribution.

The current public link remains a valid bookmarkable **directory**, but the Director expressly requested holding the *final directive* until genuine installers and access are ready. Do not infer any ability to perform follow-up work asynchronously.
