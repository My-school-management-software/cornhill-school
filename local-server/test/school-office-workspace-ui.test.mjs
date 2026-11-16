import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/school.html", import.meta.url), "utf8");
const js = await readFile(new URL("../public/school.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/school.css", import.meta.url), "utf8");
const https = await readFile(new URL("../src/https-server.mjs", import.meta.url), "utf8");

test("School Office page serves local responsive assets without third-party dependencies", () => {
  assert.match(html, /<title>CORNHILL \\| School Office<\\/title>/);
  assert.match(html, /href="\\/school\\.css"/);
  assert.match(html, /src="\\/school\\.js"/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:\\/\\//i);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:\\/\\//i);
  assert.match(css, /@media/);
});

test("School Office contains role-aware overview, learner register and admission forms", () => {
  for (const id of ["login-form", "overview", "learners", "admissions", "class-count", "learner-count", "scope-note", "learner-rows", "admission-form", "admission-message"]) {
    assert.ok(html.includes('id="' + id + '"'), "Missing School Office component " + id);
  }
  for (const field of ["firstName", "middleName", "lastName", "gender", "dateOfBirth", "admissionDate", "classId", "lin", "learnerType", "previousSchool", "isBursary", "bursaryFeeUgx"]) {
    assert.ok(html.includes('name="' + field + '"'), "Missing admission field " + field);
  }
  assert.match(html, /Search by pupil code, LIN or learner name/);
  assert.match(html, /server generates the permanent pupil code/i);
});

test("School Office uses authenticated same-origin APIs, CSRF and permission-gated actions", () => {
  for (const route of ["/api/v1/health", "/auth/staff/login", "/auth/session", "/auth/logout", "/school/catalog", "/school/learners", "/school/admissions"]) {
    assert.ok(js.includes(route), "Missing local API route " + route);
  }
  assert.match(js, /X-Cornhill-CSRF/);
  assert.match(js, /credentials:"same-origin"/);
  assert.match(js, /cache:"no-store"/);
  assert.match(js, /admissions\\.register_learner/);
  assert.match(js, /learners\\.read/);
  assert.match(js, /learners\\.lin_manage/);
  assert.match(js, /learners\\.guardians_manage/);
});

test("School Office submits admission details and displays the server-generated permanent pupil code", () => {
  assert.match(js, /new FormData\\(e\\.currentTarget\\)/);
  assert.match(js, /api\\("\\/school\\/admissions"/);
  assert.match(js, /d\\.learner\\.pupilCode/);
  assert.match(js, /Permanent pupil code:/);
  assert.match(js, /bursaryFeeUgx:Number/);
  assert.match(js, /body\\.guardian=/);
});

test("School Office learner search sends class and search filters and renders returned values as text", () => {
  assert.match(js, /p\\.set\\("classId",c\\)/);
  assert.match(js, /p\\.set\\("search",q\\)/);
  assert.match(js, /\\["class-filter","admission-class"\\]/);
  assert.match(js, /td\\.textContent=v/);
  assert.match(js, /learner-rows/);
  assert.doesNotMatch(js, /innerHTML\\s*=\\s*[^;]*(?:l\\.pupilCode|l\\.lin|l\\.firstName|d\\.)/);
});

test("HTTPS server allow-lists the School Office page and its local assets", () => {
  for (const route of ['"/school"', '"/school.html"', '"/school.js"', '"/school.css"']) {
    assert.ok(https.includes(route), "HTTPS server does not allow-list " + route);
  }
});
