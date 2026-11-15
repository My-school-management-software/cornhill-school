import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../scripts/verify-director-runtime-credential.mjs", import.meta.url), "utf8");

test("Director runtime credential diagnostic uses the restricted live-login database role", () => {
  assert.match(source, /readLocalRuntimeDatabaseConfig/);
  assert.match(source, /createPostgresAuthRepositories/);
  assert.match(source, /findStaffByUsername/);
  assert.match(source, /current_user AS db_user/);
});

test("Director runtime credential diagnostic verifies locally without creating login state", () => {
  assert.match(source, /askHidden/);
  assert.match(source, /hasher\.verify/);
  assert.match(source, /No login attempt, session, or audit event was created/);
  assert.doesNotMatch(source, /loginAttemptStore|createAuthenticatedSession|loginStaff\(/);
});
