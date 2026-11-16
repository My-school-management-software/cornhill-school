import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/school.html", import.meta.url), "utf8");
const js = await readFile(new URL("../public/school.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/school.css", import.meta.url), "utf8");
const https = await readFile(new URL("../src/https-server.mjs", import.meta.url), "utf8");

test("School Office page serves local responsive assets without third-party dependencies", () => {
  assert.ok(html.includes("<title>CORNHILL | School Office</title>"));
  assert.ok(html.includes('href="/school.css"'));
  assert.ok(html.includes('src="/school.js"'));
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:/i);
  assert.ok(css.includes("@media"));
});

test("School Office contains role-aware overview, learner register and admission forms", () => {
  for (const id of ["login-form", "overview", "learners", "admissions", "class-count", "learner-count", "scope-note", "learner-rows", "admission-form", "admission-message"]) {
    assert.ok(html.includes('id="' + id + '"'), "Missing School Office component " + id);
  }
  for (const field of ["firstName", "middleName", "lastName", "gender", "dateOfBirth", "admissionDate", "classId", "lin", "learnerType", "previousSchool", "isBursary", "bursaryFeeUgx"]) {
    assert.ok(html.includes('name="' + field + '"'), "Missing admission field " + field);
  }
  assert.ok(html.includes("Search by pupil code, LIN or learner name"));
  assert.match(html, /server generates the permanent pupil code/i);
});

test("School Office uses authenticated same-origin APIs, CSRF and permission-gated actions", () => {
  for (const route of ["/api/v1/health", "/auth/staff/login", "/auth/session", "/auth/logout", "/school/catalog", "/school/learners", "/school/admissions"]) {
    assert.ok(js.includes(route), "Missing local API route " + route);
  }
  assert.ok(js.includes("X-Cornhill-CSRF"));
  assert.ok(js.includes('credentials:"same-origin"'));
  assert.ok(js.includes('cache:"no-store"'));
  for (const permission of ["admissions.register_learner", "learners.read", "learners.lin_manage", "learners.guardians_manage"]) {
    assert.ok(js.includes(permission), "Missing permission gate " + permission);
  }
});

test("School Office submits admission details and displays the server-generated permanent pupil code", () => {
  for (const fragment of ["new FormData(e.currentTarget)", 'api("/school/admissions"', "d.learner.pupilCode", "Permanent pupil code:", "bursaryFeeUgx:Number", "body.guardian="]) {
    assert.ok(js.includes(fragment), "Missing admission workflow fragment " + fragment);
  }
});

test("School Office learner search sends class and search filters and renders returned values as text", () => {
  for (const fragment of ['p.set("classId",c)', 'p.set("search",q)', '["class-filter","admission-class"]', "td.textContent=v", "learner-rows"]) {
    assert.ok(js.includes(fragment), "Missing learner-list workflow fragment " + fragment);
  }
  assert.doesNotMatch(js, /innerHTML\s*=\s*[^;]*(?:l\.pupilCode|l\.lin|l\.firstName|d\.)/);
});

test("HTTPS server allow-lists the School Office page and its local assets", () => {
  for (const route of ['"/school"', '"/school.html"', '"/school.js"', '"/school.css"']) {
    assert.ok(https.includes(route), "HTTPS server does not allow-list " + route);
  }
});
