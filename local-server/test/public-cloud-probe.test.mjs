import test from "node:test";
import assert from "node:assert/strict";
import { probePublicCloud, VERIFIED_PRODUCTION_ORIGIN } from "../src/sync/public-cloud-probe.mjs";

const fake = (status, type = "text/html") => ({
  status,
  headers: { get: key => key.toLowerCase() === "content-type" ? type : null },
  body: { cancel: async () => {} }
});

test("uses verified production URL instead of stale preview or LAN address", () => {
  assert.equal(VERIFIED_PRODUCTION_ORIGIN, "https://cornhill-school-swart.vercel.app/");
  assert.doesNotMatch(VERIFIED_PRODUCTION_ORIGIN, /10\.10\.|localhost|ir6okm37u/);
});

test("probe sends no credentials, private records, token or request body", async () => {
  let calls = 0;
  const result = await probePublicCloud(async (url, options) => {
    calls++;
    assert.equal(url, VERIFIED_PRODUCTION_ORIGIN);
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "manual");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers.Accept, "text/html");
    assert.equal("body" in options, false);
    assert.equal("Authorization" in options.headers, false);
    return fake(200);
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "public_html_reachable");
  assert.equal(result.cloudAuthVerified, false);
  assert.equal(result.localDataSyncVerified, false);
  assert.equal(result.schoolRecordWritesAllowed, false);
});

test("200 JSON is not accepted as a healthy public website", async () => {
  const result = await probePublicCloud(async () => fake(200, "application/json"));
  assert.equal(result.status, "not_verified");
});

test("redirects are rejected rather than followed", async () => {
  for (const code of [301, 302, 307, 308]) {
    const result = await probePublicCloud(async () => fake(code, "text/html"));
    assert.equal(result.status, "not_verified");
  }
});

test("authentication failure, server error and rate limit are not accepted", async () => {
  for (const code of [401, 403, 404, 429, 500]) {
    const result = await probePublicCloud(async () => fake(code));
    assert.equal(result.status, "not_verified");
  }
});

test("unreachable endpoint fails closed and does not leak network errors", async () => {
  const result = await probePublicCloud(async () => { throw new Error("secret private data"); });
  assert.equal(result.status, "unreachable");
  assert.equal(result.statusCode, null);
  assert.doesNotMatch(JSON.stringify(result), /secret|private data/);
});

test("refuses unsupported request implementations", async () => {
  await assert.rejects(probePublicCloud(null), /request must be a function/);
});

test("result is frozen and never upgrades auth/sync readiness", async () => {
  const result = await probePublicCloud(async () => fake(200, "text/html; charset=utf-8"));
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.cloudAuthVerified, false);
  assert.equal(result.localDataSyncVerified, false);
});
