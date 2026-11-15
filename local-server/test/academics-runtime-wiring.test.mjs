import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(new URL("../src/security/auth-runtime.mjs", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/077_local_academics_workspace_api.sql", import.meta.url), "utf8");

test("academic repositories and routes are composed into both runtime configurations", () => {
  assert.match(runtime, /createPostgresAcademicsRepository/);
  assert.match(runtime, /createAcademicsHttpHandler/);
  assert.match(runtime, /academicsRouteHandler\(request, response\)/);
  assert.ok((runtime.match(/academicsRouteHandler\(request, response\)/g) || []).length >= 2);
});

test("academics uses the dedicated local authentication runtime and leaves readiness blocked", async () => {
  const readiness = await readFile(new URL("../src/full-school-readiness.mjs", import.meta.url), "utf8");
  assert.match(migration, /TO cornhill_auth_runtime/);
  assert.match(runtime, /database_user !== "cornhill_auth_api"/);
  assert.match(readiness, /frontend_not_integrated/);
  assert.match(readiness, /school_api_parity_incomplete/);
});