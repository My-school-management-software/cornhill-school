import test from "node:test";
import assert from "node:assert/strict";
import { createArgon2PasswordHasher } from "../src/security/argon2-password-hasher.mjs";

let hasher;
let knownHash;
let dummyHash;

test("Argon2id adapter initialises and publishes the selected OWASP baseline", async () => {
  hasher = await createArgon2PasswordHasher();
  assert.deepEqual(hasher.policy, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32
  });
});

test("password hashing creates an Argon2id PHC hash accepted by the policy validator", async () => {
  knownHash = await hasher.hash("Cornhill-strong-test-passphrase-2026");
  assert.match(knownHash, /^\$argon2id\$v=19\$/);
  assert.equal(hasher.isArgon2idHash(knownHash), true);
});

test("password verification accepts the correct credential", async () => {
  assert.equal(await hasher.verify(knownHash, "Cornhill-strong-test-passphrase-2026"), true);
});

test("password verification rejects a wrong credential", async () => {
  assert.equal(await hasher.verify(knownHash, "Not-the-correct-passphrase"), false);
});

test("Argon2id validator rejects malformed and non-Argon2 hashes", () => {
  assert.equal(hasher.isArgon2idHash("plain-text"), false);
  assert.equal(hasher.isArgon2idHash("$argon2i$invalid"), false);
  assert.equal(hasher.isArgon2idHash("$2b$12$bcrypt-hash"), false);
  assert.equal(hasher.isArgon2idHash(null), false);
});

test("credential input is validated before hashing and verifying", async () => {
  await assert.rejects(hasher.hash(""), /non-empty string/);
  await assert.rejects(hasher.hash("x".repeat(1025)), /1024 UTF-8 bytes/);
  await assert.rejects(hasher.verify(knownHash, ""), /non-empty string/);
});

test("dummy Argon2id hash is valid and freshly salted for unknown-account checks", async () => {
  dummyHash = await hasher.createDummyHash();
  const another = await hasher.createDummyHash();
  assert.equal(hasher.isArgon2idHash(dummyHash), true);
  assert.equal(hasher.isArgon2idHash(another), true);
  assert.notEqual(dummyHash, another);
});

test("dummy hash does not verify as a user-chosen known credential", async () => {
  assert.equal(await hasher.verify(dummyHash, "Cornhill-strong-test-passphrase-2026"), false);
});
