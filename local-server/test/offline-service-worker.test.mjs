import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

function createWorkerHarness() {
  const listeners = new Map();
  const cached = new Map();
  const addedAssets = [];
  const written = [];
  let networkCalls = 0;
  let cacheOpenCalls = 0;

  const cache = {
    async addAll(paths) {
      addedAssets.push(...paths);
      for (const path of paths) cached.set(new URL(path, "https://cornhill.local").pathname, { shellAsset: path });
    },
    async match(request) {
      return cached.get(new URL(request.url).pathname);
    },
    async put(request, response) {
      const path = new URL(request.url).pathname;
      cached.set(path, response);
      written.push(path);
    }
  };

  const caches = {
    async open() {
      cacheOpenCalls += 1;
      return cache;
    },
    async keys() { return []; },
    async delete() { return true; }
  };

  const self = {
    location: new URL("https://cornhill.local"),
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener(type, handler) { listeners.set(type, handler); }
  };

  vm.runInNewContext(source, {
    self, caches, URL, Request, Set, Promise,
    fetch: async request => {
      networkCalls += 1;
      return {
        ok: true,
        type: "basic",
        url: request.url,
        clone() { return { cachedNetworkCopy: true, url: request.url }; }
      };
    }
  });

  async function install() {
    const pending = [];
    listeners.get("install")({ waitUntil(promise) { pending.push(promise); } });
    await Promise.all(pending);
  }

  async function dispatchFetch(url, method = "GET") {
    let responsePromise;
    const event = {
      request: new Request(url, { method }),
      respondWith(promise) { responsePromise = Promise.resolve(promise); }
    };
    listeners.get("fetch")(event);
    return {
      intercepted: Boolean(responsePromise),
      response: responsePromise ? await responsePromise : undefined
    };
  }

  return {
    listeners, cached, addedAssets, written, install, dispatchFetch,
    get networkCalls() { return networkCalls; },
    get cacheOpenCalls() { return cacheOpenCalls; }
  };
}

test("offline install precaches every public workspace shell without API routes", async () => {
  const worker = createWorkerHarness();
  await worker.install();

  for (const path of ["/", "/school", "/academics", "/bursar", "/leadership", "/staff-operations", "/attendance-import", "/guardian"]) {
    assert.ok(worker.addedAssets.includes(path), "missing cached public route " + path);
  }
  assert.ok(worker.addedAssets.length > 0);
  assert.ok(worker.addedAssets.every(path => !path.startsWith("/api/")));
});

test("GET API requests bypass the service worker cache completely", async () => {
  const worker = createWorkerHarness();
  await worker.install();
  const before = worker.cacheOpenCalls;
  const result = await worker.dispatchFetch("https://cornhill.local/api/v1/health");

  assert.equal(result.intercepted, false);
  assert.equal(worker.networkCalls, 0);
  assert.equal(worker.cacheOpenCalls, before);
  assert.deepEqual(worker.written, []);
});

test("POST mutations are never intercepted or queued by the public-shell service worker", async () => {
  const worker = createWorkerHarness();
  await worker.install();
  const before = worker.cacheOpenCalls;
  const result = await worker.dispatchFetch("https://cornhill.local/api/v1/school/admissions", "POST");

  assert.equal(result.intercepted, false);
  assert.equal(worker.networkCalls, 0);
  assert.equal(worker.cacheOpenCalls, before);
  assert.deepEqual(worker.written, []);
});

test("cross-origin resources are not cached by the local service worker", async () => {
  const worker = createWorkerHarness();
  await worker.install();
  const result = await worker.dispatchFetch("https://third-party.example/library.js");

  assert.equal(result.intercepted, false);
  assert.equal(worker.networkCalls, 0);
  assert.deepEqual(worker.written, []);
});

test("an allowed public workspace shell is served cache-first", async () => {
  const worker = createWorkerHarness();
  await worker.install();
  const result = await worker.dispatchFetch("https://cornhill.local/school");

  assert.equal(result.intercepted, true);
  assert.deepEqual(result.response, { shellAsset: "/school" });
  assert.equal(worker.networkCalls, 0);
  assert.deepEqual(worker.written, []);
});

test("a missing approved shell asset falls back to network and caches only a successful same-origin response", async () => {
  const worker = createWorkerHarness();
  await worker.install();
  worker.cached.delete("/school");
  const result = await worker.dispatchFetch("https://cornhill.local/school");

  assert.equal(result.intercepted, true);
  assert.equal(result.response.url, "https://cornhill.local/school");
  assert.equal(worker.networkCalls, 1);
  assert.deepEqual(worker.written, ["/school"]);
});

test("unknown same-origin paths are not cached as application data", async () => {
  const worker = createWorkerHarness();
  await worker.install();
  const result = await worker.dispatchFetch("https://cornhill.local/private-records");

  assert.equal(result.intercepted, false);
  assert.equal(worker.networkCalls, 0);
  assert.deepEqual(worker.written, []);
});
