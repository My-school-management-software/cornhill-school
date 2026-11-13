import test from "node:test";
import assert from "node:assert/strict";
import { createCornhillServer } from "../src/server.mjs";

async function withServer(run) {
  const server = createCornhillServer({ port: 0 });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const baseUrl = "http://127.0.0.1:" + address.port;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("health endpoint reports that database and school data are not enabled", async () => {
  await withServer(async baseUrl => {
    const response = await fetch(baseUrl + "/api/v1/health");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const payload = await response.json();
    assert.equal(payload.status, "ok");
    assert.equal(payload.stage, "health-only-scaffold");
    assert.equal(payload.database, "not-configured");
    assert.equal(payload.authentication, "not-configured");
    assert.equal(payload.schoolDataEnabled, false);
  });
});

test("home page clearly identifies the prototype and warns against real data", async () => {
  await withServer(async baseUrl => {
    const response = await fetch(baseUrl + "/");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    assert.match(html, /Prototype only/);
    assert.match(html, /Do not enter real school information/);
  });
});

test("unknown school-data and repository-file paths are not served", async () => {
  await withServer(async baseUrl => {
    for (const path of ["/students", "/finance", "/index.html", "/docs/README.md", "/supabase/migrations", "/.env"]) {
      const response = await fetch(baseUrl + path);
      assert.equal(response.status, 404, path + " must remain unavailable");
    }
  });
});

test("health endpoint rejects write methods", async () => {
  await withServer(async baseUrl => {
    const response = await fetch(baseUrl + "/api/v1/health", { method: "POST" });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
  });
});

test("health endpoint supports HEAD without returning a body", async () => {
  await withServer(async baseUrl => {
    const response = await fetch(baseUrl + "/api/v1/health", { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
  });
});
