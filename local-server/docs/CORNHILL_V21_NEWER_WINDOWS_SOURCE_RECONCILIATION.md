# CORNHILL V2.1 — newer Windows source review and safe integration bridge

**Review date:** 27 November 2026. **Source:** Director-supplied `CORNHILL-SOURCE-REVIEW-20261126-085341-6c27086f.zip` (code-only ZIP). **Status:** Non-destructive review. No production code, Windows EXE, PostgreSQL rows, school payments, Vercel deployment or Supabase data changed.

## Critical source divergence

The 26 November Windows source snapshot is **far newer** than the GitHub integration branch underlying this draft PR. Concrete findings:

| Comparison | Windows source snapshot | This draft PR's starting base |
|---|---|---|
| Local migrations | 111 SQL files through version **121** (096–105 not present in supplied ZIP) | 95 original migrations through version 095; V21 PR adds migration 096 |
| Academics UI script | roughly **68 KB**, with newer class/subject mark sheets, historical comparisons, school workflows | older roughly **18 KB** UI before this V21 patch |
| Local auth runtime | roughly **20 KB**, multiple newer workspaces | older roughly **13.5 KB** runtime before V21 |
| Desktop build scripts | Windows NSIS/portable and EXE packaging scripts present | base branch is not the latest Windows installation |

**DO NOT merge this draft branch into the user's current Windows source and do not overwrite the newer UI/runtime.** Migration 096 also needs an explicit, verified migration-ledger compatibility check before it is proposed to that newer installation. The ZIP does not prove which migrations are actually applied in the user's current working PostgreSQL database.

## Actual work against the newer source

A **separate source-code proposal** was generated from the newer Windows snapshot, targeting only its current `public/academics.js`, `academics.html`, and `academics.css`. It preserves the newer academic UI while adding clear marks-saving states and warnings against accidental loss of unsaved teacher scores/comments.

Verification performed on a disposable copy of the supplied source:

- `node --check` on updated newer `public/academics.js`: **PASS**.
- Relevant source-only academics, hosted-parity and dependency tests: **13/13 PASS**.
- Broader offline-shell group: **25/28 PASS**, remaining **3 errors** due to files omitted from the source-review ZIP (`school.html` and school badge image); this cannot establish full Windows integration.
- Full Windows browser/end-to-end staff workflow: **NOT tested**.
- Newly developed source proposal is staged separately as `CORNHILL-V21-NEWER-SOURCE-ACADEMICS-REVIEW.zip` for safe review; it is **not an installer**, **not deployed**, and **not applied over unknown later V16 source hotfixes**.

## Next technical steps before deployment

1. Reconcile the 26 November source snapshot, any November 27 V16 hotfixes, Git working-tree status, migration ledger and real installed desktop binary. Do not replace current files by name alone.
2. Port V21 authentication/academic offline modules into the newer source with narrow patches and original-content checks, **not** by replacing `auth-runtime.mjs` or `academics.js` wholesale.
3. Resolve migration version/ledger compatibility, then run PostgreSQL 17 isolated backup/restore and full newer-source tests.
4. Bind only approved, OS-protected encrypted academic drafts to an authenticated local backend. Keep offline finance sync disabled.
5. Run staff role, nursery collections, offline, LAN, multi-PC and Android acceptance against the **actual installed build** before clearing any gate.

**Five formal acceptance blockers remain 0/5 cleared, because neither current installed-source parity nor end-to-end sync/multi-device acceptance has been proven.**
