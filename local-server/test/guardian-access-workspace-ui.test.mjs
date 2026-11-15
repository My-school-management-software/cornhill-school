import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Leadership shows guardian approval controls behind the explicit high-risk permission", async () => {
  const html = await readFile(new URL("../public/leadership.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/leadership.js", import.meta.url), "utf8");
  assert.ok(html.includes('id="guardian-access-panel"'));
  assert.ok(html.includes('id="guardian-contact-rows"'));
  assert.ok(html.includes("guardians.access_approve"));
  assert.ok(js.includes('can("guardians.access_approve")'));
  assert.ok(js.includes("/guardian/access/contacts"));
  assert.ok(js.includes("/guardian/access/issue-pin"));
  assert.ok(js.includes("replaceExisting"));
});

test("guardian administration masks contact numbers and avoids persistent PIN storage or unsafe HTML", async () => {
  const js = await readFile(new URL("../public/leadership.js", import.meta.url), "utf8");
  assert.ok(js.includes("phoneLastFour"));
  assert.ok(js.includes('textContent = result.pin'));
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
  assert.doesNotMatch(js, /innerHTML\s*=/);
});
