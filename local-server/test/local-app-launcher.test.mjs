import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../public/app.css", import.meta.url), "utf8");
const httpsServer = await readFile(new URL("../src/https-server.mjs", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

test("local app launcher links all seven locally served school workspaces", () => {
  for (const route of ["/school", "/academics", "/bursar", "/leadership", "/staff-operations", "/attendance-import", "/guardian"]) {
    assert.match(html, new RegExp('href="' + route.replace("/", "\\/") + '"'));
  }
  assert.match(html, /School Office/);
  assert.match(html, /Teaching &amp; Academics|Teaching & Academics/);
  assert.match(html, /Bursar &amp; Finance|Bursar & Finance/);
  assert.match(html, /Leadership &amp; Staff|Leadership & Staff/);
});

test("launcher does not imply that pending full-school modules are operational", () => {
  for (const label of ["Integration pending", "API parity pending", "Migration pending", "Acceptance pending"]) {
    assert.ok(html.includes(label), "missing explicit pending label: " + label);
  }
  assert.match(html, /not a release certificate/i);
  assert.match(html, /Do not enter production school records/i);
});

test("launcher uses only the same-origin local health and readiness endpoints", () => {
  assert.match(script, /fetch\("\/api\/v1\/health"/);
  assert.match(script, /fetch\("\/api\/v1\/readiness"/);
  assert.doesNotMatch(script, /https?:\/\//i);
  assert.doesNotMatch(html, /https?:\/\//i);
});

test("finance navigation stays disabled until the runtime health response confirms it", () => {
  assert.match(script, /health\.financeApiEnabled === true/);
  assert.match(script, /aria-disabled/);
  assert.match(script, /protected local finance runtime is enabled/);
});

test("launcher keeps the release gate dependent on the server readiness response", () => {
  assert.match(script, /renderReadiness\(readiness\)/);
  for (const code of [
    "frontend_not_integrated",
    "school_api_parity_incomplete",
    "hosted_dependencies_pending",
    "offline_sync_not_accepted",
    "multi_device_acceptance_pending"
  ]) {
    assert.ok(script.includes(code), "missing readiness mapping: " + code);
  }
});

test("launcher has responsive layouts and reduced-motion support", () => {
  assert.match(styles, /@media\(max-width:800px\)/);
  assert.match(styles, /@media\(max-width:560px\)/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("local HTTPS server exposes the launcher only through an explicit same-origin asset map", () => {
  for (const route of ["/app", "/app.html", "/app.js", "/app.css"]) {
    assert.ok(httpsServer.includes('["' + route + '"'), "missing local launcher route " + route);
  }
});


test("launcher registers the offline shell only in secure browser contexts", () => {
  assert.match(script, /navigator\.serviceWorker\.register\("\/sw\.js"/);
  assert.match(script, /window\.isSecureContext/);
});

test("offline worker caches only an explicit public static asset allowlist", () => {
  assert.match(serviceWorker, /const STATIC_ASSETS = new Set\(/);
  assert.match(serviceWorker, /if \(url\.pathname\.startsWith\("\/api\/"\)\) return/);
  assert.match(serviceWorker, /if \(!STATIC_ASSETS\.has\(url\.pathname\)\) return/);
  assert.match(serviceWorker, /request\.method !== "GET"/);
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
  assert.match(serviceWorker, /cornhill-public-shell-v1/);
  assert.match(serviceWorker, /cache\.addAll\(\[\.\.\.STATIC_ASSETS\]\)/);
});

test("offline worker allowlist includes every local workspace shell and never stores API paths", () => {
  for (const route of ["/", "/app", "/school", "/academics", "/bursar", "/leadership", "/staff-operations", "/attendance-import", "/guardian"]) {
    assert.ok(serviceWorker.includes('"' + route + '"'), "missing offline shell route " + route);
  }
  assert.doesNotMatch(serviceWorker, /STATIC_ASSETS[^;]*\/api\//s);
  assert.match(httpsServer, /\["\/sw\.js"/);
});

test("launcher explains the exact offline boundary for cached screens, private records and writes", () => {
  assert.match(html, /OFFLINE CAPABILITY/);
  assert.match(html, /Public application screens/);
  assert.match(html, /Private school records/);
  assert.match(html, /API data is never stored by the offline shell/);
  assert.match(html, /Offline write queue is not enabled/);
  assert.match(script, /navigator\.onLine/);
  assert.match(script, /addEventListener\("online"/);
  assert.match(script, /addEventListener\("offline"/);
  assert.match(script, /local-service-note/);
});

test("browser network state does not block loopback local-service checks", () => {
  assert.match(script, /Browser network interface connected/);
  assert.match(script, /a local server on this computer may still work/);
  assert.doesNotMatch(script, /if\s*\(navigator\.onLine\s*===\s*false\)[\s\S]{0,180}return/);
});
