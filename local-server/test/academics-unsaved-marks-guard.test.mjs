import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const js = await readFile(new URL("../public/academics.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/academics.html", import.meta.url), "utf8");

test("marks form shows server-save confirmation rather than falsely claiming offline sync", () => {
  assert.match(html, /id="mark-save-state"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Offline drafts are not automatically synchronized/);
});

test("all edits to score or comment fields mark the register unsaved", () => {
  assert.match(js, /document\.addEventListener\("input"/);
  assert.match(js, /closest\?\.\("#mark-rows"\)/);
  assert.match(js, /marksDirty = true/);
  assert.match(js, /markEditVersion\+\+/);
});

test("save status is only confirmed after the academic POST awaits a server response", () => {
  const start = js.indexOf('async function saveMarks()');
  const post = js.indexOf('result = await api("/academics/marks"', start);
  const confirmed = js.indexOf('markSaveState(result.savedCount + " mark(s) confirmed saved', start);
  assert.ok(start >= 0 && post > start && confirmed > post);
});

test("uncertain network results never state that school marks are saved", () => {
  assert.match(js, /SAVE NOT CONFIRMED: Keep these entries/);
  assert.match(js, /a lost response may still have saved them/);
  assert.match(js, /No offline upload was performed/);
  assert.match(js, /throw new Error\("Save not confirmed/);
});

test("duplicate submission blocked during active mark-save operation", () => {
  assert.match(js, /if \(markSaveInFlight\) return/);
  assert.match(js, /markSaveInFlight = true/);
  assert.match(js, /\$\("save-marks"\)\.disabled = true/);
  assert.match(js, /finally \{\s*markSaveInFlight = false/);
});

test("late edits during an in-flight request remain explicitly unsaved", () => {
  assert.match(js, /markEditVersion !== editVersionAtSend/);
  assert.match(js, /later edits are NOT confirmed saved/);
  assert.match(js, /later edits remain unsaved/);
});

test("leaving a page while marks are unsaved triggers native navigation warning", () => {
  assert.match(js, /window\.addEventListener\("beforeunload"/);
  assert.match(js, /if \(!marksDirty && !markSaveInFlight\) return/);
  assert.match(js, /event\.preventDefault\(\)/);
});

test("changing class, term, assessment or reloading preserves unsaved marks pending confirmation", () => {
  const handlers = js.slice(js.indexOf('$("class-select").addEventListener("change"'));
  for (const key of ['class-select', 'term-select', 'assessment-select', 'reload-marks']) {
    const start = handlers.indexOf('$("' + key + '").addEventListener(');
    const next = handlers.indexOf('});', start);
    const body = handlers.slice(start, next < 0 ? undefined : next + 3);
    assert.ok(start >= 0, "Missing handler: " + key);
    assert.match(body, /confirmMarkDraftDiscard/);
  }
});

test("never stores marks in insecure web storage, browser cache or service worker queue", () => {
  assert.doesNotMatch(js, /localStorage\.setItem|sessionStorage\.setItem|indexedDB\.open|caches\.open/);
  assert.doesNotMatch(js, /navigator\.serviceWorker\.controller\.postMessage/);
});

test("server-confirmed marks are still submitted to existing authenticated API only", () => {
  assert.match(js, /await api\("\/academics\/marks"/);
  assert.match(js, /credentials: "same-origin", cache: "no-store"/);
  assert.match(js, /\["X-Cornhill-CSRF"\] = csrf\(\)/);
});

test("no finance or guardian record submissions are added to academics interface", () => {
  assert.doesNotMatch(js, /\/finance\/payments|\/guardian\/pin|\/finance\/credits/);
});
