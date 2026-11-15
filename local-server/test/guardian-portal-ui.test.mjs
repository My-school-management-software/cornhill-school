import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("guardian portal requires registered phone and PIN and uses only same-origin local APIs", async () => {
  const html = await readFile(new URL("../public/guardian.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/guardian.js", import.meta.url), "utf8");
  assert.ok(html.includes("Parent &amp; Guardian Portal"));
  assert.ok(html.includes('name="phone"'));
  assert.ok(html.includes('maxlength="13"'));
  assert.ok(html.includes('name="pin"'));
  assert.ok(html.includes('pattern="[0-9]{8}"'));
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
