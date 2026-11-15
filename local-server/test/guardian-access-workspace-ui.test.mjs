import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Leadership shows the guardian approval panel as a separately permission-gated workspace", async () => {
  const html = await readFile(new URL("../public/leadership.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/leadership.js", import.meta.url), "utf8");
  assert.match(html, /id="guardian-access-panel"/);
  assert.match(html, /id="guardian-contact-rows"/);
  assert.match(html, /guardians\\.access_approve/);
  assert.match(js, /can\\("guardians\\.access_approve"\\)/);
  assert.match(js, /\\/guardian\\/access\\/contacts/);
  assert.match(js, /\\/guardian\\/access\\/issue-pin/);
  assert.match(js, /replaceExisting/);
});

test("guardian administration masks contact numbers and does not put one-time PINs in persistent browser storage", async () => {
  const js = await readFile(new URL("../public/leadership.js", import.meta.url), "utf8");
  assert.match(js, /phoneLastFour/);
  assert.match(js, /textContent = result\\.pin/);
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
  assert.doesNotMatch(js, /innerHTML\\s*=/);
});
