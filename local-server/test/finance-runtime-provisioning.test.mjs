import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("finance provisioning generates a private secret and validates dedicated least-privilege roles", async () => {
  const source = await readFile(new URL("../scripts/enable-local-finance-runtime.mjs", import.meta.url), "utf8");
  assert.match(source, /randomBytes\(48\)/);
  assert.match(source, /cornhill_finance_runtime/);
  assert.match(source, /cornhill_finance_api/);
  assert.match(source, /WITH LOGIN PASSWORD/);
  assert.match(source, /CORNHILL_DB_FINANCE_RUNTIME_PASSWORD/);
  assert.match(source, /NOLOGIN PASSWORD NULL/);
  assert.doesNotMatch(source, /console\.(?:log|info)\([^\n]*password/i);
});

test("finance verifier tests the enabled runtime login as the dedicated API role", async () => {
  const source = await readFile(new URL("../scripts/verify-local-finance.mjs", import.meta.url), "utf8");
  assert.match(source, /readLocalFinanceRuntimeDatabaseConfig/);
  assert.match(source, /expectsFinanceLogin/);
  assert.match(source, /current_user AS database_user/);
  assert.match(source, /cornhill_finance_api/);
});
