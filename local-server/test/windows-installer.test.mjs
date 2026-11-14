import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const script = await readFile(new URL("../../windows/Install-CORNHILL-Local.ps1", import.meta.url), "utf8");

test("Windows installer checks supported Windows and Node versions before setup", () => {
  assert.match(script, /Win32_OperatingSystem/);
  assert.match(script, /BuildNumber/);
  assert.match(script, /nodeMajor -lt 22/);
});

test("installer preserves an existing environment file and generates a new secret only when absent", () => {
  assert.match(script, /if \(-not \(Test-Path "\.env"\)\)/);
  assert.match(script, /RandomNumberGenerator/);
  assert.match(script, /Existing \.env found; leaving it unchanged/);
});

test("installer uses pinned dependencies and local-only database migration flags", () => {
  assert.match(script, /npm ci/);
  assert.match(script, /CORNHILL_ALLOW_LOCAL_MIGRATIONS/);
  assert.match(script, /CORNHILL_DB_TARGET/);
  assert.match(script, /local-development/);
});

test("installer verifies all local modules and never deletes the database volume", () => {
  for (const command of ["db:verify", "db:verify-auth", "db:verify-runtime", "db:verify-school"]) {
    assert.ok(script.includes(command));
  }
  assert.doesNotMatch(script, /docker compose down -v/);
  assert.match(script, /Do not delete the database volume/);
});

test("installer does not expose database ports to the LAN or claim the app is ready", () => {
  assert.match(script, /localhost port 54329/);
  assert.match(script, /NOT enabled yet/);
  assert.match(script, /full local school app/);
});
