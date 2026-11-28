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
  assert.match(html, /id="report-history-panel"/);
  assert.match(js, /\/academics\/assessments\/" \+ assessment\.id \+ "\/report-cards/);
  assert.match(js, /\/academics\/learners\/" \+ learnerId \+ "\/report-cards/);
  assert.match(js, /Generate report cards/);
  assert.match(js, /createElement\("details"\)/);
  assert.match(js, /credentials: "same-origin"/);
  assert.doesNotMatch(js, /supabase|localStorage\.setItem|sessionStorage\.setItem/i);
});
test("academic workspace exposes year and term setup behind academic management permissions", () => {
  assert.match(html, /id="period-setup"/);
  assert.match(html, /id="create-year-form"/);
  assert.match(html, /id="create-term-form"/);
  assert.match(js, /academics\.terms_manage/);
  assert.match(js, /\/academics\/years/);
  assert.match(js, /\/academics\/terms/);
  assert.match(js, /renderPeriods/);
});

test("class advancement requires an explicit decision for each learner; none are selected by default", () => {
  for (const id of [
    "advancement-panel", "advancement-class-select", "advancement-term-select",
    "load-advancement", "advancement-candidates", "approve-selected-advancements"
  ]) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(js, /Not yet decided — keep pending/);
  assert.match(js, /Promote to /);
  assert.match(js, /Repeat /);
  assert.match(js, /Completed primary school \(graduate\)/);
  assert.match(js, /advance|advancement/i);
  assert.match(js, /window\.confirm/);
  assert.match(js, /selectedEditors = advancementEditors\.filter\(editor => editor\.decision\.value\)/);
  assert.match(js, /approved: true/);
  assert.match(css, /advancement-row/);
});
