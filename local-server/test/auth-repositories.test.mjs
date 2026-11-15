import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/db/auth-repositories.mjs", import.meta.url), "utf8");
const auditSection = source.slice(source.indexOf("const auditRepository"));

test("auth account lookups use parameterised queries and normalized identifiers", () => {
  assert.match(source, /username_normalized\s*=\s*\$1/);
  assert.match(source, /phone_e164\s*=\s*\$1/);
  assert.match(source, /pool\.query\([\s\S]*,\s*\[normalizedUsername\]\)/);
});
test("staff repository returns role assignments and active class assignments separately", () => {
  assert.match(source, /staff_role_assignments/);
  assert.match(source, /staff_class_assignments/);
  assert.match(source, /ca\.is_active\s*=\s*true/);
});
test("staff account and session lookups load role grants per assigned role", () => {
  assert.equal((source.match(/jsonb_object_agg\(grants\.role_code, grants\.permissions\)/g) || []).length, 2);
  assert.match(source, /LEFT JOIN cornhill_auth\.staff_role_permissions rp/);
  assert.match(source, /AS "rolePermissions"/);
  assert.match(source, /FILTER \(WHERE rp\.permission_code IS NOT NULL\)/);
});

test("rate limiting is transaction-scoped and serializes both identifier and source keys", () => {
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /lockKeys\s*=\s*\[[\s\S]*\.sort\(\)/);
  assert.match(source, /succeeded\s*=\s*false/);
});
test("rate limiting records failed attempts by default and caps concurrent requests", () => {
  assert.match(source, /VALUES\s*\(\$1,\s*\$2,\s*\$3,\s*false,\s*\$4\)/);
  assert.match(source, /failures\s*\?\?\s*0\)\s*>=\s*maxFailedAttempts/);
});
test("session creation uses a transaction and locks the active account row", () => {
  assert.match(source, /SELECT id FROM cornhill_auth\.\$\{accountTable\}[\s\S]*FOR UPDATE/);
  assert.match(source, /createAuthenticatedSession/);
});
test("successful login creation atomically finalises the attempt with session and audit", () => {
  assert.match(source, /UPDATE cornhill_auth\.login_attempts[\s\S]*SET succeeded = true[\s\S]*principal_type = \$2[\s\S]*succeeded = false/);
  assert.match(source, /INSERT INTO cornhill_auth\.auth_sessions/);
  assert.match(source, /authentication\.login_succeeded/);
});
test("database authorization repositories enforce guardian, class and role scopes", () => {
  assert.match(source, /hasApprovedLearnerAccess/);
  assert.match(source, /gla\.access_status = 'approved'/);
  assert.match(source, /ga\.account_status = 'active'/);
  assert.match(source, /hasActiveClassAssignment/);
  assert.match(source, /ca\.is_active = true/);
  assert.match(source, /getGrantedPermissionsForStaff/);
  assert.match(source, /staff_role_permissions/);
});
test("session lookup excludes revoked and expired sessions", () => {
  assert.match(source, /s\.revoked_at IS NULL/);
  assert.match(source, /s\.expires_at > now\(\)/);
});
test("session revoke only updates an unrevoked row", () => {
  assert.match(source, /SET revoked_at = \$2[\s\S]*revoked_at IS NULL/);
});
test("repository returns separate staff and guardian identity columns", () => {
  assert.match(source, /staff_account_id AS "staffAccountId"/);
  assert.match(source, /guardian_account_id AS "guardianAccountId"/);
  assert.match(source, /COALESCE\(sa\.account_status, ga\.account_status\)/);
});
test("audit records store only a keyed identifier fingerprint, never raw credentials", () => {
  assert.match(auditSection, /JSON\.stringify\(identifierFingerprint \? \{ identifierFingerprint \} : \{\}\)/);
  assert.doesNotMatch(auditSection, /\b(?:password|pin|rawPhone|rawUsername)\b/i);
});
