import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("guardian contact locking uses a fixed-search-path security definer function", async () => {
  const migration = await readFile(new URL("../migrations/085_local_guardian_contact_lock_function.sql", import.meta.url), "utf8");
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog, cornhill_school/);
  assert.match(migration, /FOR UPDATE OF gc, l/);
  assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO cornhill_auth_runtime/);
  assert.doesNotMatch(migration, /GRANT UPDATE[\s\S]*guardian_contacts/);
  assert.doesNotMatch(migration, /GRANT UPDATE[\s\S]*learners/);
});

test("guardian access repository uses the narrow locking function, not direct row-lock privileges", async () => {
  const repository = await readFile(new URL("../src/db/guardian-access-repositories.mjs", import.meta.url), "utf8");
  assert.match(repository, /lock_active_guardian_contact_for_access/);
  assert.doesNotMatch(repository, /FOR UPDATE OF gc/);
});
