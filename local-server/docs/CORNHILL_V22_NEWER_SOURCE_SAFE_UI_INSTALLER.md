# CORNHILL V22 — source-safe academic UI installer (27 Nov 2026)

**Packaging status: BUILT and verified in a disposable Linux test environment, NOT installed on the Director's Windows computer.** This effort addresses a narrowly scoped part of **release blocker 1 (frontend integration)**. It does not clear any of the five release blockers.

## Source origin and drift protection

- Baseline: Director-provided code-only November 26 2026 Windows archive `CORNHILL-SOURCE-REVIEW-20261126-085341-6c27086f.zip` (111 migrations up to version 121 in the archive, newer than GitHub's original integration branch).
- V22 modifies only `public/academics.js`, `public/academics.html`, `public/academics.css` after **all three live SHA256 digests** exactly match this reviewed baseline. No file is overwritten if newer or partially modified source is detected.
- V22 guards every known marks-creating workflow that would otherwise discard an unsaved teacher score or comment: class/term/assessment switches, reload, sign-out, assessment lock/publish transition, new term/year/assessment, browser window close.
- Save statuses explicitly distinguish **unsaved**, **saving**, **confirmed by local server**, **unconfirmed**; an uncertain response does not claim marks were saved. The original mark-entry API is preserved, no offline mark upload or financial operation is added.

## Artifact and safety

Private user-downloadable source integration ZIP: `CORNHILL-V22-ACADEMICS-SAFE-INTEGRATION.zip`. ZIP SHA-256: `24f6713c616cbe7d5962fd60069ddbb0a9cfd71aa5e1623ea94d1e6e0c0f0e93`.

The package contains a Node 22+ safe patch runner and PowerShell one-command entry, an integrity manifest, reviewed academic UI, and original fixtures. It uses exact source hash matching, verifies the ZIP candidate and syntax, runs self-tests, backs up all three originals in the Director's **Downloads** directory, applies and verifies the files with restore-on-failure, and refuses unknown/newer source without making changes. The patch runner does not read or modify a school database, school payment, Vercel deployment, Supabase project, current EXE or HTTPS service.

**Isolated verification**: 16 academic UI acceptance tests + 9 source patch installer tests = **25/25 passed** using Node 22.16.0 on Linux, including simulated apply, idempotency, source divergence block, partial state block, original source backup, and no database writes. Windows PowerShell and installed-machine acceptance **NOT YET VERIFIED**.

## Release constraints

The GitHub integration PR is still based on an older local-server tree. Its new migration 096 and academic API must **not** be copied into the newer installed source without reconciling migration-ledger identity and current Windows source files. V22 does not attempt this.

The separate staff-written implementation remains on a **draft PR** and is not deployed. To use this UI package, the Director must explicitly run the provided script on the Windows machine. If any live source hash differs, V22 exits with `CORNHILL_V22=BLOCKED`, avoiding overwrite of V16/hotfixed files; subsequent work needs a source-preserving merge.

**Formal release gates cleared: 0/5.** Financial synchronization remains disabled because cloud and Windows payment ledgers do not match.
