import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createCornhillHttpsServer } from "../src/https-server.mjs";

const handler = async () => true;
const validBase = {
  authHandler: handler,
  expectedOrigin: "https://cornhill.local",
  keyPath: "C:\\cornhill-private\\cornhill.key",
  certPath: "C:\\cornhill-private\\cornhill.crt"
};

test("HTTPS server requires an authentication handler", async () => {
  await assert.rejects(
    createCornhillHttpsServer({ ...validBase, authHandler: null }),
    /route handler is required/
  );
});
test("HTTPS server refuses non-loopback bindings", async () => {
  for (const host of ["0.0.0.0", "192.168.1.10", "::"]) {
    await assert.rejects(
      createCornhillHttpsServer({ ...validBase, host }),
      /loopback only/
    );
  }
});
test("HTTPS server rejects invalid ports", async () => {
  for (const port of [80, 443, 0, 65536, 4174.5]) {
    await assert.rejects(
      createCornhillHttpsServer({ ...validBase, port }),
      /port must be/
    );
  }
});
test("HTTPS server accepts only an exact HTTPS origin", async () => {
  for (const expectedOrigin of ["http://cornhill.local", "https://cornhill.local/app", "https://cornhill.local?x=1"]) {
    await assert.rejects(
      createCornhillHttpsServer({ ...validBase, expectedOrigin }),
      /exact HTTPS origin/
    );
  }
});
test("TLS files must use absolute paths outside the source repository", async () => {
  const insideKey = resolve(process.cwd(), "tls", "private.key");
  const insideCert = resolve(process.cwd(), "tls", "certificate.crt");
  await assert.rejects(
    createCornhillHttpsServer({
      ...validBase,
      keyPath: insideKey,
      certPath: insideCert
    }),
    /outside the source repository/
  );
});

test("HTTPS server rejects TLS key/certificate paths inside the repository", async () => {
  const insideKey = resolve(process.cwd(), "nested", "repo", "secret.key");
  const insideCert = resolve(process.cwd(), "nested", "repo", "certificate.crt");
  await assert.rejects(
    createCornhillHttpsServer({
      ...validBase,
      keyPath: insideKey,
      certPath: insideCert
    }),
    /outside the source repository/
  );
});

test("HTTPS server source supports native Windows PFX and validates the exported certificate", async () => {
  const source = await (await import("node:fs/promises")).readFile(
    new URL("../src/https-server.mjs", import.meta.url), "utf8"
  );
  assert.match(source, /pfxPath/);
  assert.match(source, /pfxPassphrase/);
  assert.match(source, /createSecureContext\(\{ pfx, passphrase: pfxPassphrase/);
  assert.match(source, /x509\.checkHost\(expectedHostname\)/);
  assert.match(source, /assertOutsideRepository\(pfxPath, "TLS PFX bundle"\)/);
});

test("HTTPS startup passes PFX settings from private environment variables", async () => {
  const source = await (await import("node:fs/promises")).readFile(
    new URL("../scripts/start-local-auth.mjs", import.meta.url), "utf8"
  );
  assert.match(source, /CORNHILL_TLS_PFX_PATH/);
  assert.match(source, /CORNHILL_TLS_PFX_PASSWORD/);
  assert.match(source, /pfxPassphrase/);
});

test("Windows HTTPS setup generates a trusted localhost certificate and private PFX configuration", async () => {
  const source = await (await import("node:fs/promises")).readFile(
    new URL("../../windows/Configure-CORNHILL-LocalHttps.ps1", import.meta.url), "utf8"
  );
  assert.match(source, /New-SelfSignedCertificate/);
  assert.match(source, /Cert:\\CurrentUser\\Root/);
  assert.match(source, /Export-PfxCertificate/);
  assert.match(source, /CORNHILL_TLS_PFX_PASSWORD/);
  assert.match(source, /https:\/\/localhost:4174/);
  assert.doesNotMatch(source, /Write-Host\s+\$pfxPassword/);
});

test("HTTPS server source bounds request and header timeouts", async () => {
  const source = await (await import("node:fs/promises")).readFile(
    new URL("../src/https-server.mjs", import.meta.url), "utf8"
  );
  assert.match(source, /server\.requestTimeout\s*=\s*15_000/);
  assert.match(source, /server\.headersTimeout\s*=\s*10_000/);
  assert.match(source, /server\.keepAliveTimeout\s*=\s*5_000/);
  assert.match(source, /server\.maxHeadersCount\s*=\s*50/);
});

test("local HTTPS server exposes only the explicit school workspace assets", async () => {
  const source = await (await import("node:fs/promises")).readFile(
    new URL("../src/https-server.mjs", import.meta.url), "utf8"
  );
  for (const route of ["/app", "/app.html", "/app.js", "/app.css", "/staff-operations", "/staff-operations.html", "/staff-operations.js", "/staff-operations.css", "/bursar", "/bursar.html", "/bursar.js", "/bursar.css", "/school", "/school.html", "/school.js", "/school.css", "/academics", "/academics.html", "/academics.js", "/academics.css", "/leadership", "/leadership.html", "/leadership.js", "/leadership.css"]) {
    assert.ok(source.includes('["' + route + '"'), "missing explicit static route " + route);
  }
  assert.match(source, /school\.html/);
  assert.match(source, /school\.js/);
  assert.match(source, /school\.css/);
});

test("school workspace calls only authenticated local school APIs", async () => {
  const source = await (await import("node:fs/promises")).readFile(
    new URL("../public/school.js", import.meta.url), "utf8"
  );
  assert.match(source, /\/auth\/staff\/login/);
  assert.match(source, /\/auth\/session/);
  assert.match(source, /\/school\/catalog/);
  assert.match(source, /\/school\/learners/);
  assert.match(source, /\/school\/admissions/);
  assert.match(source, /X-Cornhill-CSRF/);
  assert.match(source, /admissions\.register_learner/);
  assert.match(source, /learners\.lin_manage/);
  assert.match(source, /learners\.guardians_manage/);
  assert.match(source, /credentials:"same-origin"/);
});
