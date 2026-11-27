# CORNHILL V36 — direct academic offline POST integration, production-locked

Date: 27 November 2026, Uganda. Director requested PROCEED WITH Academic Synchronization Integration. No Codex required.

## Verified starting point
- V33 academic baseline/preview code installed and recognized on real Windows localhost HTTPS 4174 (POST-only preview route GET returned HTTP 405 after Node restart).
- V35B REAL isolated synthetic PG17 acceptance PASS on Director's Windows: 42/42 source tests, mark insertion, replay/idempotency, stale conflict rollback, unauthorised teacher and closed assessment blocked, parallel identical batch, private scratch cleaned; no production writes.
- V32C current backup, isolated restore and encrypted same-Windows-user backup PASS; hosted Posted=8 versus local Posted=9, financial sync disabled.

## V36 source implementation created
Artifact: CORNHILL-V36-SAFE-ACADEMIC-SYNC-API-INTEGRATION.zip, **51,214 bytes**, SHA256 **d64af255f9a66367b76386f3a0cf93c58c46949c972804b4442618508005b892**. ZIP CRC and all internal SHA256SUMS entries verified. **93/93 Node22 focused tests PASS** (0 fail, 0 skip); all changed JS source syntax checks PASS.

Reviewed-source integration targets after exact SHA256 checks:
- local-server/src/security/academics-http-handler.mjs: extend existing V33 handler with POST /api/v1/academics/offline/commit, requiring authenticated staff, HTTPS/exact Origin and Host, valid CSRF, marks_enter permission, class/subject scope and Open assessment. Invalid 400, stale/closed 409, replay 200, applied 201. No names/scores/receipts in responses.
- local-server/src/security/auth-runtime.mjs: inject V35 transaction repository using existing authenticated cornhill_auth_api PostgreSQL pool. Protected opt-in policy must be true for verified *synthetic isolated test DB only*. For normal cornhill_local, no env setting enables the POST write route.
- local-server/scripts/start-local-auth.mjs: forward test installation/DB identity verification flags, which can ONLY be set true after verifyTestInstallTarget confirms isolated test database.
- new local-server/src/security/v34-offline-mark-commit.mjs, local-server/src/security/v36-isolated-commit-policy.mjs, local-server/src/db/v35-offline-mark-transaction.mjs.
- review SQL migration 122 is included for future review but **NOT installed/copied into local-server/migrations**, NOT run on any working or test DB by V36 installer.

V36 Windows runner verifies internal hashes, runs all 93 tests in package fixture without .env/production DB, checks exact old V33 handler SHA256, auth-runtime SHA, startup SHA and V33 module SHA; backs up three originals to private LocalAppData/CORNHILL/V36/SourceBackups, installs three new modules and changes only the three reviewed source files. Mismatched code fails closed. It NEVER queries/touches the working DB, finance/cloud, server processes or migration runner. Runner does not restart the Node application; endpoint visibility in running server requires separately reviewed app restart.

**Crucial release boundary:** This is source integration with default production write flag **OFF**, not automatic academic synchronization. Actual Windows V36 installation has NOT YET been reported. Live auth+CSRF test of new POST, full production-schema migration compatibility and journal approval are PENDING. Current 2026 school year/term and assessments may be planned/closed; no real marks should be written until Director-approved lifecycle state and physical-device acceptance. Offline encrypted phone/desktop outbox and multi-device acceptance also pending. Finance sync OFF, 0/5 formal release gates cleared.

V36 executable source is in independent reviewed ZIP, not merged into live GitHub production branch. Do not merge any unverified source snapshot over a newer Windows installation.