import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const script=await readFile(new URL("../windows/Update-CORNHILL-Desktop.ps1",import.meta.url),"utf8");

test("desktop updater fetches the approved branch using fast-forward only and protects uncommitted work",()=>{
  assert.match(script,/Invoke-Checked "git" @\("fetch","origin"/);
  assert.match(script,/Invoke-Checked "git" @\("merge","--ff-only"/);
  assert.match(script,/git status --porcelain/);
  assert.match(script,/uncommitted changes/);
});

test("desktop updater installs pinned dependencies and runs Windows and database checks as one batch",()=>{
  assert.match(script,/"install","--no-package-lock","--no-audit","--no-fund"/);
  assert.match(script,/npm.*test/);
  assert.match(script,/Attendance Devices & Imports/);
  assert.match(script,/staff\.attendance_import/);
  for(const check of ["db:migrate","db:verify","db:verify-auth","db:verify-runtime","db:verify-school","db:verify-finance","db:director-status","setup:director"]) assert.ok(script.includes(check));
});

test("desktop updater refuses remote databases and does not delete or recreate local data",()=>{
  assert.match(script,/127[.]0[.]0[.]1/);
  assert.match(script,/cornhill_local/);
  assert.match(script,/CORNHILL_ALLOW_LOCAL_MIGRATIONS/);
  assert.doesNotMatch(script,/DROP DATABASE|dropdb|TRUNCATE TABLE|Remove-Item.*PGDATA/i);
});

test("desktop updater configures localhost HTTPS only when missing and can launch the local service",()=>{
  assert.match(script,/Configure-CORNHILL-LocalHttps[.]ps1/);
  assert.match(script,/npm run start:auth/);
  assert.match(script,/https:\/\/localhost:4174/);
});

test("desktop updater identifies the listener on port 4174 before attempting a restart",()=>{
  assert.match(script,/Get-NetTCPConnection -LocalPort 4174 -State Listen/);
  assert.ok(script.includes("scripts[\\\\/]start-local-auth\\.mjs"));
  assert.match(script,/CORNHILL local authentication server/);
});

test("desktop updater verifies the original PowerShell launcher path before stopping a process",()=>{
  assert.match(script,/Win32_Process/);
  assert.ok(script.includes("npm(?:\\.cmd)?\\s+run\\s+start:auth"));
  assert.match(script,/IndexOf\(\$expectedPath/);
  assert.match(script,/Nothing was stopped/);
});

test("desktop updater gracefully signals and waits for the old server before starting another",()=>{
  assert.match(script,/process\.kill\(\$listenerPid, 'SIGINT'\)/);
  assert.match(script,/The existing local service did not release port 4174/);
  assert.ok(script.indexOf("Stop-ExistingLocalAuthService $localServerRoot") < script.indexOf('Start-Process -FilePath "powershell.exe"'));
});

test("desktop updater opens the local workspace launcher after restart",()=>{
  assert.match(script,/https:\/\/localhost:4174\/app/);
  assert.doesNotMatch(script,/https:\/\/localhost:4174\/leadership/);
});

test("desktop updater PowerShell syntax parses on Windows", { skip: process.platform !== "win32" }, () => {
  const updaterPath = fileURLToPath(new URL("../windows/Update-CORNHILL-Desktop.ps1", import.meta.url));
  const escapedPath = updaterPath.replace(/'/g, "''");
  const command = "$tokens=$null; $errors=$null; " +
    "[System.Management.Automation.Language.Parser]::ParseFile('" + escapedPath +
    "',[ref]$tokens,[ref]$errors) | Out-Null; " +
    "if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_ }; exit 1 }";
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout || "PowerShell parser did not complete successfully.");
});
