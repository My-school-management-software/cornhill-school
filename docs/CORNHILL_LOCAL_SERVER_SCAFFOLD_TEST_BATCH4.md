# CORNHILL Local Server Scaffold — Test Batch 4

Date: 2026-11-13
Branch: feat/local-first-self-hosted-migration-20261113

## Implemented

The first isolated local-server code has been added under local-server/:

- package.json: dependency-free Node.js server package.
- src/server.mjs: HTTP server with a fixed loopback bind (127.0.0.1), local status page and one read-only health endpoint.
- public/status.html: clear prototype warning; it states that no school login, database or records are connected.
- test/server.test.mjs: five automated tests.
- README.md: Windows/developer run instructions and current safety boundary.

The health endpoint is /api/v1/health. It reports database=not-configured, authentication=not-configured and schoolDataEnabled=false.

## Verification performed

Runtime used: Node.js v22.16.0.

| Check | Result |
|---|---|
| Health endpoint returns expected scaffold status | PASS |
| Status page identifies itself as a prototype and warns against entering real data | PASS |
| Unknown learner/finance and repository-file paths return 404 | PASS |
| POST to the health endpoint is rejected with 405 | PASS |
| HEAD health request returns no response body | PASS |
| npm test | 5 passed, 0 failed, 0 skipped |
| Start server on 127.0.0.1:4173 and request health endpoint | PASS |

The temporary test server was stopped after verification. The server code has no external package dependencies and does not connect to a database or hosted API.

## Safety and completion boundary

This is a health-only scaffold, not the replacement school management application. It intentionally serves only its own warning/status page and health endpoint; it does not serve the existing index.html, does not expose repository files, and does not connect to live school records.

It binds to 127.0.0.1 only. Do not expose it to the school LAN yet. LAN access requires the authentication/authorisation layer, secure HTTPS, private storage, backups and the relevant acceptance tests.

The live CORNHILL PWA, Vercel hosting and Supabase project remain unchanged. No production data was copied or modified. No paid-plan changes were made.

## Next build batch

1. Add local configuration validation and a server-side logging/audit foundation.
2. Prepare a local PostgreSQL development environment using synthetic data only.
3. Design the identity/session schema, retaining UUID compatibility for existing school foreign keys.
4. Implement the first authenticated API route before connecting any real user interface.
5. Keep the service loopback-only until authentication and HTTPS are independently tested.
