import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/security/auth-runtime.mjs", import.meta.url), "utf8");

test("auth runtime uses the runtime config and checks actual DB identity", () => {
  assert.match(source, /readLocalRuntimeDatabaseConfig/);
  assert.match(source, /current_user AS database_user/);
  assert.match(source, /database_user !== "cornhill_auth_api"/);
  assert.match(source, /database_name !== "cornhill_local"/);
});
test("auth runtime creates Argon2 dummy hash and injects a private fingerprint secret", () => {
  assert.match(source, /createDummyHash/);
  assert.match(source, /CORNHILL_AUTH_FINGERPRINT_SECRET/);
  assert.match(source, /createAuthService/);
  assert.match(source, /fingerprintSecret/);
});
test("auth runtime never falls back to the administrator DB role", () => {
  assert.match(source, /new Pool\(config\)/);
  assert.doesNotMatch(source, /CORNHILL_DB_ADMIN_USER|CORNHILL_DB_ADMIN_PASSWORD/);
});
test("auth runtime closes its pool on startup failure", () => {
  assert.match(source, /await pool\.end\(\)/);
});
