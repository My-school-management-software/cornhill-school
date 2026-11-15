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

test("Director runtime credential diagnostic fails closed before account lookup on an unexpected database identity", () => {
  assert.match(source, /if \(!runtimeIdentityMatches\)/);
  assert.match(source, /no account lookup was attempted/);
  assert.ok(source.indexOf("if (!runtimeIdentityMatches)") < source.indexOf("createPostgresAuthRepositories(pool)"));
});
