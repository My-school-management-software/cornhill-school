import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("guardian portal requires learner code, registered phone, then school-issued PIN and uses same-origin APIs", async () => {
  const html = await readFile(new URL("../public/guardian.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/guardian.js", import.meta.url), "utf8");
  assert.ok(html.includes("Parent &amp; Guardian Portal"));
  assert.ok(html.includes('name="pupilCode"'));
  assert.ok(html.includes('name="phone"'));
  assert.ok(html.includes('maxlength="18"'));
  assert.ok(html.includes('name="pin"'));
  assert.ok(html.includes('pattern="[0-9]{8}"'));
  assert.ok(js.includes("/guardian/entry-check"));
  assert.ok(html.includes('id="pin-form" hidden'));
  assert.ok(js.includes("verifiedLearnerCode"));
  assert.ok(js.includes("verifiedGuardianPhone"));
  assert.ok(js.includes("resetEntry"));
  assert.ok(js.includes("/auth/guardian/login"));
  assert.ok(js.includes("/auth/session"));
  assert.ok(js.includes("/guardian/learners"));
  assert.ok(js.includes('credentials: "same-origin"'));
  assert.ok(js.includes("createElement"));
  assert.doesNotMatch(js, /innerHTML\s*=/);
  assert.doesNotMatch(js, /https?:\/\//);
});

test("guardian contact administration is visibly separate from parent sign-in", async () => {
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  assert.ok(html.includes("Parent &amp; Guardian Portal"));
  assert.ok(html.includes('href="/guardian"'));
});

test("guardian input must show learner and phone verification before entering school PIN", async () => {
  const html = await readFile(new URL("../public/guardian.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/guardian.js", import.meta.url), "utf8");
  assert.ok(html.indexOf('id="login-form"') < html.indexOf('id="pin-form"'));
  assert.match(html, /Step 1 of 2/);
  assert.match(html, /Step 2 of 2/);
  assert.match(html, /school office must issue a PIN/);
  assert.match(js, /api\("\/guardian\/entry-check"/);
  assert.match(js, /api\("\/auth\/guardian\/login"/);
  assert.match(js, /guardian\/learners\?pupilCode=/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|innerHTML\s*=/i);
});
