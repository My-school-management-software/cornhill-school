import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../public/app.css", import.meta.url), "utf8");
const httpsServer = await readFile(new URL("../src/https-server.mjs", import.meta.url), "utf8");

test("local app launcher provides links to the four currently integrated workspaces", () => {
  for (const route of ["/school", "/academics", "/bursar", "/leadership", "/staff-operations"]) {
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
