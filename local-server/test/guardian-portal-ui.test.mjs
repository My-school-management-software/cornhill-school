import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("guardian portal requires registered phone and PIN and uses only same-origin local APIs", async () => {
  const html = await readFile(new URL("../public/guardian.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/guardian.js", import.meta.url), "utf8");
  assert.match(html, /Parent &amp; Guardian Portal/);
  assert.match(html, /pattern="\\+256\[0-9\]\{9\}"/);
  assert.match(html, /pattern="\[0-9\]\{8\}"/);
  assert.match(js, /\/auth\/guardian\/login/);
  assert.match(js, /\/auth\/session/);
  assert.match(js, /\/guardian\/learners/);
  assert.match(js, /credentials:\s*"same-origin"/);
  assert.match(js, /createElement/);
  assert.doesNotMatch(js, /innerHTML\s*=/);
  assert.doesNotMatch(js, /https?:\/\//);
});

test("guardian contact administration is visibly separate from parent sign-in", async () => {
  const html = await readFile(new URL("../public/app.html", import.meta.url), "utf8");
  assert.match(html, /Parent &amp; Guardian Portal/);
  assert.match(html, /href="\/guardian"/);
});
