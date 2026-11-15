import test from "node:test";
import assert from "node:assert/strict";
import {
  createOpaqueSessionSecrets,
  hashOpaqueToken,
  verifyOpaqueToken
} from "../src/security/session-tokens.mjs";

function deterministicRandomBytes() {
  let counter = 0;
  return size => Buffer.alloc(size, ++counter);
}

test("session and CSRF tokens are separate 256-bit base64url values", () => {
  const secrets = createOpaqueSessionSecrets({ randomBytes: deterministicRandomBytes() });
  assert.match(secrets.sessionToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(secrets.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(secrets.sessionToken, secrets.csrfToken);
});
test("only SHA-256 token hashes are intended for database storage", () => {
  const secrets = createOpaqueSessionSecrets({ randomBytes: deterministicRandomBytes() });
  assert.match(secrets.sessionTokenHash, /^[a-f0-9]{64}$/);
  assert.match(secrets.csrfTokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(secrets.sessionTokenHash, secrets.sessionToken);
});
test("opaque token hashing is stable", () => {
  const secrets = createOpaqueSessionSecrets({ randomBytes: deterministicRandomBytes() });
  assert.equal(hashOpaqueToken(secrets.sessionToken), secrets.sessionTokenHash);
});
test("valid opaque token verifies against its stored hash", () => {
  const secrets = createOpaqueSessionSecrets({ randomBytes: deterministicRandomBytes() });
  assert.equal(verifyOpaqueToken(secrets.sessionToken, secrets.sessionTokenHash), true);
});
test("tampered opaque tokens do not verify", () => {
  const secrets = createOpaqueSessionSecrets({ randomBytes: deterministicRandomBytes() });
  const tampered = secrets.sessionToken.slice(0, -1) + (secrets.sessionToken.endsWith("A") ? "B" : "A");
  assert.equal(verifyOpaqueToken(tampered, secrets.sessionTokenHash), false);
});
test("malformed tokens and hashes fail verification without throwing", () => {
  assert.equal(verifyOpaqueToken("not-a-token", "a".repeat(64)), false);
  assert.equal(verifyOpaqueToken("A".repeat(43), "not-a-hash"), false);
});
test("token helpers reject malformed input to the hash function", () => {
  assert.throws(() => hashOpaqueToken("password"), /invalid format/);
});
test("returned secret bundle is immutable", () => {
  const secrets = createOpaqueSessionSecrets({ randomBytes: deterministicRandomBytes() });
  assert.equal(Object.isFrozen(secrets), true);
  assert.throws(() => { secrets.sessionToken = "changed"; }, TypeError);
});
test("random source must provide exactly 32 bytes", () => {
  assert.throws(() => createOpaqueSessionSecrets({ randomBytes: () => Buffer.alloc(16) }), /exactly 32 bytes/);
});
test("random source must be callable", () => {
  assert.throws(() => createOpaqueSessionSecrets({ randomBytes: "not-a-function" }), /random source/);
});
