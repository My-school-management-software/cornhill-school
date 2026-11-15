import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const script=await readFile(new URL("../windows/Update-CORNHILL-Desktop.ps1",import.meta.url),"utf8");
test("desktop updater fetches the approved branch using fast-forward only and protects uncommitted work",()=>{
 assert.match(script,/Invoke-Checked "git" @\("fetch","origin"/);
 assert.match(script,/Invoke-Checked "git" @\("merge","--ff-only"/);
 assert.match(script,/git status --porcelain/);
 assert.match(script,/uncommitted changes/);
});
test("desktop updater installs pinned dependencies and runs Windows and database checks as one batch",()=>{
 assert.match(script,/"ci","--no-audit","--no-fund"/);
 assert.match(script,/npm.*test/);
 for(const check of ["db:migrate","db:verify","db:verify-auth","db:verify-runtime","db:verify-school","db:verify-finance","db:director-status","setup:director"])assert.ok(script.includes(check));
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
