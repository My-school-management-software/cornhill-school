// CORNHILL V2.1 encrypted offline ACADEMIC MARK DRAFT vault.
// A real durable, local-only encrypted queue; NOT an active sync pipeline.
// Must be invoked by a permission-checked backend. No browser/remote access.
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdir, lstat, open, readdir, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FINGERPRINT = /^[0-9a-f]{64}$/;
const MAX_PLAINTEXT_BYTES = 2048;
const DRAFT_FIELDS = new Set([
  "operationId", "scope", "learnerSourceId", "assessmentSourceId",
  "subjectSourceId", "actorStaffId", "score", "baselineRevision",
  "baselineFingerprint"
]);

function assertObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
       Object.getPrototypeOf(value) !== null)) {
    throw new TypeError("Academic draft must be a plain object");
  }
}
function validateDraft(value) {
  assertObject(value);
  if (Object.keys(value).length !== DRAFT_FIELDS.size ||
      Object.keys(value).some(key => !DRAFT_FIELDS.has(key))) {
    throw new TypeError("Academic draft contains missing or unsupported fields");
  }
  for (const key of ["operationId", "learnerSourceId", "assessmentSourceId", "subjectSourceId", "actorStaffId"]) {
    if (typeof value[key] !== "string" || !UUID.test(value[key])) {
      throw new TypeError(key + " must be a canonical UUID");
    }
  }
  if (value.scope !== "assessment_score") {
    throw new TypeError("Only assessment_score drafts are allowed");
  }
  if (typeof value.score !== "number" || !Number.isFinite(value.score) ||
      value.score < 0 || value.score > 100) {
    throw new TypeError("Draft score must be in range 0-100");
  }
  if (!Number.isSafeInteger(value.baselineRevision) || value.baselineRevision < 1 ||
      typeof value.baselineFingerprint !== "string" ||
      !FINGERPRINT.test(value.baselineFingerprint)) {
    throw new TypeError("A verified positive baseline revision and SHA-256 fingerprint are required");
  }
  const canonical = {
    operationId: value.operationId, scope: value.scope,
    learnerSourceId: value.learnerSourceId,
    assessmentSourceId: value.assessmentSourceId,
    subjectSourceId: value.subjectSourceId,
    actorStaffId: value.actorStaffId,
    score: value.score, baselineRevision: value.baselineRevision,
    baselineFingerprint: value.baselineFingerprint
  };
  const raw = Buffer.from(JSON.stringify(canonical), "utf8");
  if (raw.length > MAX_PLAINTEXT_BYTES) throw new TypeError("Draft payload too large");
  return raw;
}
function isWithinRoot(target, root) {
  const relativePath = relative(root, target);
  return relativePath === "" || (
    relativePath !== ".." && !relativePath.startsWith(".." + sep) &&
    !isAbsolute(relativePath)
  );
}
function requireId(value) {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new TypeError("Operation ID must be a canonical UUID");
  }
}
function createEnvelope(id, plaintext, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from("CORNHILL:v21:assessment-score:" + id));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.from(JSON.stringify({
    version: 1, nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64")
  }));
}
function decodeEnvelope(id, raw, key) {
  if (raw.length > 8192) throw new Error("Encrypted draft exceeds maximum size");
  const obj = JSON.parse(raw.toString("utf8"));
  if (!obj || obj.version !== 1 || typeof obj.nonce !== "string" ||
      typeof obj.tag !== "string" || typeof obj.ciphertext !== "string") {
    throw new Error("Unsupported encrypted draft envelope");
  }
  const nonce = Buffer.from(obj.nonce, "base64");
  const tag = Buffer.from(obj.tag, "base64");
  if (nonce.length !== 12 || tag.length !== 16) {
    throw new Error("Corrupt encrypted draft envelope");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from("CORNHILL:v21:assessment-score:" + id));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(obj.ciphertext, "base64")), decipher.final()
  ]);
  const candidate = JSON.parse(plaintext.toString("utf8"));
  if (candidate.operationId !== id) throw new Error("Draft operation ID mismatch");
  validateDraft(candidate);
  return candidate;
}

/**
 * Local-only encrypted draft storage; no implicit replay, merge, or deletion.
 * Key and directory are supplied by a separately authorized, audited backend.
 * Neither the key nor the contents should be available to browser JavaScript.
 */
export async function openOfflineMarkDraftVault({ directory, key } = {}) {
  if (typeof directory !== "string" || !isAbsolute(directory) ||
      isWithinRoot(resolve(directory), REPO_ROOT)) {
    throw new TypeError("Vault directory must be absolute and outside the code repository");
  }
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new TypeError("Vault requires an external 32-byte AES key");
  }
  const secret = Buffer.from(key);
  const target = resolve(directory);
  await mkdir(target, { recursive: true, mode: 0o700 });
  const entry = await lstat(target);
  const resolved = await realpath(target);
  if (!entry.isDirectory() || entry.isSymbolicLink() || isWithinRoot(resolved, REPO_ROOT)) {
    throw new TypeError("Vault directory is not an approved private directory");
  }
  if (process.platform !== "win32" && (entry.mode & 0o077) !== 0) {
    throw new Error("Vault directory permissions are too broad");
  }

  async function readDraft(id) {
    requireId(id);
    const filepath = join(resolved, id + ".draft");
    const stat = await lstat(filepath);
    if (!stat.isFile() || stat.isSymbolicLink() ||
        (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) {
      throw new Error("Encrypted draft storage permissions are unsafe");
    }
    const handle = await open(filepath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const data = await handle.readFile();
      return Object.freeze(decodeEnvelope(id, data, secret));
    } finally {
      await handle.close();
    }
  }

  async function enqueueDraft(draft) {
    const plaintext = validateDraft(draft);
    const id = draft.operationId;
    const filepath = join(resolved, id + ".draft");
    const envelope = createEnvelope(id, plaintext, secret);
    let handle;
    try {
      handle = await open(filepath, constants.O_WRONLY | constants.O_CREAT |
        constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
      await handle.writeFile(envelope);
      await handle.sync();
      return Object.freeze({ status: "queued_locally", operationId: id, uploaded: false });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      // Idempotent retries with identical payloads do not create duplicates.
      // Different content with a reused ID always fails closed.
      const existing = await readDraft(id);
      if (JSON.stringify(existing) !== plaintext.toString("utf8")) {
        throw new Error("Idempotency conflict for an existing offline operation");
      }
      return Object.freeze({ status: "already_queued", operationId: id, uploaded: false });
    } finally {
      await handle?.close();
    }
  }

  async function countPending() {
    const names = await readdir(resolved);
    return Object.freeze({
      pending: names.filter(name => UUID.test(name.slice(0, -6)) &&
        name.endsWith(".draft")).length,
      uploaded: false, financeSyncEnabled: false
    });
  }

  return Object.freeze({ enqueueDraft, readDraft, countPending });
}
