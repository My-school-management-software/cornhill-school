import { randomBytes } from "node:crypto";

const POLICY = Object.freeze({
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32
});
const MAX_SECRET_BYTES = 1024;

function assertSecret(secret) {
  if (typeof secret !== "string" || secret.length === 0 ||
      Buffer.byteLength(secret, "utf8") > MAX_SECRET_BYTES) {
    throw new TypeError("Credential must be a non-empty string no larger than 1024 UTF-8 bytes.");
  }
}

export async function createArgon2PasswordHasher() {
  const argon2 = await import("@node-rs/argon2");
  const { Algorithm, Version, hash, verify, parseOptions } = argon2;

  if (!Algorithm || !Version || typeof hash !== "function" ||
      typeof verify !== "function" || typeof parseOptions !== "function") {
    throw new Error("The installed Argon2 implementation does not expose the required API.");
  }

  function isArgon2idHash(encodedHash) {
    if (typeof encodedHash !== "string" || encodedHash.length > 512) return false;
    try {
      const options = parseOptions(encodedHash);
      return options.algorithm === Algorithm.Argon2id &&
        options.version === Version.V0x13 &&
        options.memoryCost >= POLICY.memoryCost &&
        options.timeCost >= POLICY.timeCost &&
        options.parallelism === POLICY.parallelism &&
        options.memoryCost <= 65_536 &&
        options.timeCost <= 5 &&
        options.outputLen >= POLICY.outputLen &&
        options.outputLen <= 64 &&
        options.saltLen >= 16 &&
        options.saltLen <= 64;
    } catch {
      return false;
    }
  }

  async function hashCredential(secret) {
    assertSecret(secret);
    return hash(secret, {
      ...POLICY,
      algorithm: Algorithm.Argon2id,
      version: Version.V0x13
    });
  }

  async function verifyCredential(encodedHash, secret) {
    assertSecret(secret);
    if (!isArgon2idHash(encodedHash)) return false;
    try {
      return await verify(encodedHash, secret);
    } catch {
      return false;
    }
  }

  async function createDummyHash() {
    // Random non-user secret ensures timing work is comparable for unknown
    // accounts without creating a reusable application credential.
    return hashCredential(randomBytes(32).toString("base64url"));
  }

  return Object.freeze({
    policy: POLICY,
    isArgon2idHash,
    hash: hashCredential,
    verify: verifyCredential,
    createDummyHash
  });
}