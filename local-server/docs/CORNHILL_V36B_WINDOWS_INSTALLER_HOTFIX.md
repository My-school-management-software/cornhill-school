# CORNHILL V36B — Windows source-only installer Node 24 quote-loss repair

**Date:** 27 November 2026, Uganda. **Status:** package produced and isolated tests passed; Director Windows install not yet run.

## Actual source

The Director uploaded the exact **CORNHILL-V36-SAFE-ACADEMIC-SYNC-API-INTEGRATION(1).zip**, byte-for-byte SHA256 **d64af255f9a66367b76386f3a0cf93c58c46949c972804b4442618508005b892**. Its original installer failed after a valid manifest check with the Windows PowerShell / Node call:

`node -p 'Number(process.versions.node.split(".")[0])'`

PowerShell/native-argument quoting caused Node to evaluate `split(.)`, a **SyntaxError** on Node.js v24.22.0. No working school files or database objects were changed by the failed run.

## Real repaired package

Created **CORNHILL-V36B-ACADEMIC-SYNC-NODE24-SAFE-INSTALL.zip**, SHA256 **b037d6243858acb820525a533e77ba149af46766a16c1662c23c248196f85707**, **53,059 bytes**. Original ZIP CRC and package hash verified. In revised ZIP, the exact bytes of **22/24 original non-manifest files remain unchanged**; only `README-START-HERE.txt` and `Run-CORNHILL-V36.ps1` were revised, and one new regression file was added. `SHA256SUMS.txt` was regenerated, including script and every payload/test file. ZIP CRC and every manifest SHA PASS.

The repaired PowerShell script now calls `node --version` directly and matches `^v([0-9]+)\.([0-9]+)\.([0-9]+)$` using PowerShell. It reads the actual `local-server/package.json` and **requires exactly `engines.node: ">=22"`**; it rejects an unreadable/unrecognised version, changed engine policy, or Node <22. No native `node -p` inline JavaScript argument quoting. Node24 satisfies project's declared `>=22` requirement; this does **not** prove entire Node24 runtime compatibility without a real Windows test.

## Verification and safety

**97/97 Node 22.16.0 source and regression tests PASS**, 0 fails or skips, including 93 original tests + 4 new Windows installer contract tests. Also verified from freshly extracted output ZIP: 97/97 PASS, ZIP CRC, complete manifest SHA PASS, payload source hashes unchanged. **PowerShell script execution on Director Windows is PENDING** because assistant Linux environment does not have Windows PowerShell.

Installer remains fail-closed: existing V33 SHA pinned, all 3 original live source file SHAs required, checks 97 tests and module syntax before creating a verified source backup and replacing exactly **3** source files and adding **3** reviewed modules. On unknown source hashes/partial installs it stops. It does not read `.env`, execute SQL migrations, connect to the school DB or Supabase, touch payments, restart the main HTTPS service, or enable academic marking. Migration `122_...review.sql` remains outside the school's migrations folder.

## Release acceptance

If Director's real Windows run reports `CORNHILL_V36=SOURCE_INTEGRATED_COMMIT_DISABLED`, only **source-only installation** has been accepted; production mark commit is still disabled, no real records synchronized, and no application restart performed by installer. Subsequent route-recognition tests only after separately reviewed app server restart. The five formal release blockers remain 0/5 cleared. Local posted payments 9 / hosted 8: finance sync remains disabled.
