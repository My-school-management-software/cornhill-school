import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/academics.html", import.meta.url), "utf8");
const js = await readFile(new URL("../public/academics.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/academics.css", import.meta.url), "utf8");

test("academic workspace is a local, responsive staff-only screen", () => {
  assert.match(html, /Teaching & Academic Office/);
  assert.match(html, /\/academics\.css/);
  assert.match(html, /\/academics\.js/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(html, /id="login"/);
});

test("academic workspace uses local APIs, CSRF and role permissions", () => {
  for (const route of ["/auth/staff/login", "/auth/session", "/academics/workspace", "/academics/assessments", "/academics/marks"]) {
    assert.ok(js.includes(route), "Missing local API route " + route);
  }
  assert.match(js, /X-Cornhill-CSRF/);
  assert.match(js, /academics\.marks_enter/);
  assert.match(js, /academics\.results_publish/);
  assert.match(js, /credentials: "same-origin"/);
  assert.doesNotMatch(js, /supabase|localStorage\.setItem|sessionStorage\.setItem/i);
});