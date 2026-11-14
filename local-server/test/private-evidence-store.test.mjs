import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrivateEvidenceStore, EvidenceStoreError, MAX_EVIDENCE_BYTES } from "../src/security/private-evidence-store.mjs";

const PNG = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
async function fixture(t) {
  const parent = await mkdtemp(join(tmpdir(), "cornhill-evidence-"));
  const root = join(parent, "private");
  const store = await createPrivateEvidenceStore({ rootPath: root });
  t.after(() => rm(parent, { recursive: true, force: true }));
  return { parent, root, store };
}

test("stores evidence under opaque keys and verifies SHA-256 on retrieval", async t => {
  const { store } = await fixture(t);
  const saved = await store.put({ bytes: PNG, contentType: "image/png", originalFileName: "deposit-slip.png" });
  assert.match(saved.objectKey, /^[0-9a-f-]{36}$/);
  assert.equal(saved.sha256.length, 64);
  assert.equal(saved.sizeBytes, PNG.length);
  const loaded = await store.get(saved.objectKey, saved.sha256);
  assert.deepEqual(loaded.bytes, PNG);
});

test("rejects source names containing path components without using them as storage paths", async t => {
  const { store } = await fixture(t);
  const saved = await store.put({ bytes: PNG, contentType: "image/png", originalFileName: "../../bank-slip.png" });
  assert.equal(saved.originalFileName, ".._.._bank-slip.png");
  assert.deepEqual((await store.get(saved.objectKey, saved.sha256)).bytes, PNG);
});

test("rejects a mismatched MIME declaration and unknown file signatures", async t => {
  const { store } = await fixture(t);
  await assert.rejects(store.put({ bytes: PNG, contentType: "image/jpeg", originalFileName: "x.jpg" }), EvidenceStoreError);
  await assert.rejects(store.put({ bytes: Buffer.from("not an image"), contentType: "image/png", originalFileName: "x.png" }), EvidenceStoreError);
});

test("rejects empty and oversized files before writing", async t => {
  const { store } = await fixture(t);
  await assert.rejects(store.put({ bytes: Buffer.alloc(0), contentType: "image/png", originalFileName: "x.png" }), EvidenceStoreError);
  await assert.rejects(store.put({ bytes: Buffer.alloc(MAX_EVIDENCE_BYTES + 1), contentType: "image/png", originalFileName: "x.png" }), EvidenceStoreError);
});

test("rejects storage roots inside the source repository", async () => {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  await assert.rejects(createPrivateEvidenceStore({
    rootPath: join(repositoryRoot, "local-server", ".private-evidence"),
    repositoryRoot
  }), /outside the source repository/);
});

test("rejects malformed and traversal-like object keys", async t => {
  const { store } = await fixture(t);
  await assert.rejects(store.get("../secret", "0".repeat(64)), error => error.code === "EVIDENCE_NOT_FOUND");
  await assert.rejects(store.remove("../../secret"), error => error.code === "EVIDENCE_NOT_FOUND");
});

test("detects tampering when retrieved bytes do not match the stored digest", async t => {
  const { root, store } = await fixture(t);
  const saved = await store.put({ bytes: PNG, contentType: "image/png", originalFileName: "slip.png" });
  await writeFile(join(root, saved.objectKey + ".blob"), Buffer.from("changed"));
  await assert.rejects(store.get(saved.objectKey, saved.sha256), error => error.code === "EVIDENCE_INTEGRITY_FAILURE");
});

test("removes only an opaque object and reports missing objects safely", async t => {
  const { store } = await fixture(t);
  const saved = await store.put({ bytes: PNG, contentType: "image/png", originalFileName: "slip.png" });
  assert.equal(await store.remove(saved.objectKey), true);
  assert.equal(await store.remove(saved.objectKey), false);
});

test("refuses symbolic-link storage objects", async t => {
  const { parent, root, store } = await fixture(t);
  const outside = join(parent, "outside.blob");
  await writeFile(outside, PNG);
  const key = "11111111-1111-4111-8111-111111111111";
  try { await symlink(outside, join(root, key + ".blob")); }
  catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip("Symbolic-link creation is unavailable on this Windows configuration.");
    throw error;
  }
  await assert.rejects(store.get(key, "0".repeat(64)), error =>
    error.code === "EVIDENCE_INTEGRITY_FAILURE" || error.code === "ELOOP");
});
