import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const script = await readFile(new URL("../windows/Install-CORNHILL-Local.ps1", import.meta.url), "utf8");
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const dbConfig = await readFile(new URL("../src/db/config.mjs", import.meta.url), "utf8");

test("installer checks supported Windows and Node versions", () => {
  assert.match(script, /Win32_OperatingSystem/);
  assert.match(script, /BuildNumber/);
  assert.match(script, /nodeMajor -lt 22/);
});

test("installer preserves existing environment and creates secrets only when absent", () => {
  assert.match(script, /if \(-not \(Test-Path \$envPath\)\)/);
  assert.match(script, /RandomNumberGenerator/);
  assert.match(script, /Existing \.env preserved/);
  assert.match(script, /CORNHILL_DB_PORT=5432/);
});

test("installer generates secrets with APIs supported by Windows PowerShell 5.1", () => {
  assert.match(script, /RandomNumberGenerator\]::Create\(\)/);
  assert.match(script, /\$generator\.GetBytes\(\$bytes\)/);
  assert.doesNotMatch(script, /RandomNumberGenerator\]::GetBytes\(36\)/);
});

test("installer uses native PostgreSQL 17 tools and does not require Docker", () => {
  assert.match(script, /PostgreSQL\\17\\bin/);
  assert.match(script, /psql\.exe/);
  assert.match(script, /createdb\.exe/);
  assert.doesNotMatch(script, /Require-Command "docker"/);
  assert.doesNotMatch(script, /docker compose/);
});

test("installer creates isolated admin and refuses to overwrite an existing database", () => {
  assert.match(script, /cornhill_local_admin/);
  assert.match(script, /CREATEDB/);
  assert.match(script, /already exists/);
  assert.match(script, /Read-Host .*AsSecureString/);
  assert.match(script, /Remove-Item Env:PGPASSWORD/);
});

test("installer applies local-only migrations and runs all current verifiers", () => {
  assert.match(script, /CORNHILL_ALLOW_LOCAL_MIGRATIONS/);
  assert.match(script, /CORNHILL_DB_TARGET/);
  assert.match(script, /local-development/);
  for (const command of ["db:verify","db:verify-auth","db:verify-runtime","db:verify-school"]) assert.ok(script.includes(command));
});

test("native PostgreSQL port is consistent in env example and database config", () => {
  assert.match(envExample, /CORNHILL_DB_PORT=5432/);
  assert.match(dbConfig, /CORNHILL_DB_PORT \?\? "5432"/);
});

test("installer does not claim the complete local school app is ready", () => {
  assert.match(script, /full local school app/);
  assert.match(script, /NOT enabled yet/);
});

test("installer validates URL-safe database secrets and removes temporary CREATEDB privilege", () => {
  assert.ok(script.includes('$adminPassword -notmatch "^[A-Za-z0-9_-]+$"'));
  assert.match(script, /ALTER ROLE cornhill_local_admin NOCREATEDB/);
});
