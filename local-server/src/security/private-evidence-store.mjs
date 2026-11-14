import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export class EvidenceStoreError extends Error {
  constructor(message, code = "EVIDENCE_STORE_INVALID") {
    super(message);
    this.name = "EvidenceStoreError";
    this.code = code;
  }
}

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel));
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function detectContentType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 5 && bytes.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

function safeOriginalName(value) {
  if (typeof value !== "string") throw new EvidenceStoreError("A source filename is required.");
  const cleaned = value.normalize("NFKC").replace(/[\\/\\\x00-\\x1f\\x7f]/g, "_").trim();
  const basename = cleaned.split(/[\\/]/).pop()?.slice(0, 160) ?? "";
  if (!basename || basename === "." || basename === "..") {
    throw new EvidenceStoreError("The source filename is invalid.");
  }
  return basename;
}

export async function createPrivateEvidenceStore({ rootPath, repositoryRoot = REPOSITORY_ROOT } = {}) {
  if (typeof rootPath !== "string" || !isAbsolute(rootPath)) {
    throw new TypeError("Private evidence storage must use an absolute path.");
  }
  const requestedRoot = resolve(rootPath);
  const repoRoot = resolve(repositoryRoot);
  if (isWithin(repoRoot, requestedRoot)) {
    throw new TypeError("Private evidence storage must be outside the source repository.");
  }
  await mkdir(requestedRoot, { recursive: true, mode: 0o700 });
  const root = await realpath(requestedRoot);
  if (isWithin(repoRoot, root)) {
    throw new TypeError("Resolved private evidence storage must be outside the source repository.");
  }
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new TypeError("Private evidence storage root must be a real directory.");
  }

  function objectPath(objectKey) {
    if (typeof objectKey !== "string" || !UUID.test(objectKey)) {
      throw new EvidenceStoreError("The evidence object key is invalid.", "EVIDENCE_NOT_FOUND");
    }
    const target = resolve(root, objectKey + ".blob");
    if (!isWithin(root, target) || dirname(target) !== root) {
      throw new EvidenceStoreError("The evidence object key is invalid.", "EVIDENCE_NOT_FOUND");
    }
    return target;
  }

  return Object.freeze({
    async put({ bytes, contentType, originalFileName } = {}) {
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
        throw new EvidenceStoreError("Evidence must contain a non-empty file.");
      }
      if (bytes.length > MAX_EVIDENCE_BYTES) {
        throw new EvidenceStoreError("Evidence exceeds the 15 MB file limit.", "EVIDENCE_TOO_LARGE");
      }
      if (!TYPES.has(contentType) || detectContentType(bytes) !== contentType) {
        throw new EvidenceStoreError("The file content does not match an allowed evidence format.");
      }
      const fileName = safeOriginalName(originalFileName);
      const objectKey = randomUUID();
      const target = objectPath(objectKey);
      const handle = await open(target, "wx", 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } catch (error) {
        await handle.close().catch(() => {});
        await rm(target, { force: true }).catch(() => {});
        throw error;
      }
      await handle.close();
      return Object.freeze({
        objectKey,
        sha256: digest(bytes),
        sizeBytes: bytes.length,
        contentType,
        originalFileName: fileName
      });
    },

    async get(objectKey, expectedSha256) {
      const target = objectPath(objectKey);
      let stats;
      try { stats = await lstat(target); }
      catch (error) {
        if (error.code === "ENOENT") throw new EvidenceStoreError("Evidence was not found.", "EVIDENCE_NOT_FOUND");
        throw error;
      }
      if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_EVIDENCE_BYTES) {
        throw new EvidenceStoreError("The stored evidence object is invalid.", "EVIDENCE_INTEGRITY_FAILURE");
      }
      const noFollow = constants.O_NOFOLLOW ?? 0;
      const handle = await open(target, constants.O_RDONLY | noFollow);
      let bytes;
      try { bytes = await handle.readFile(); } finally { await handle.close(); }
      const actualDigest = digest(bytes);
      if (typeof expectedSha256 !== "string" || !/^[0-9a-f]{64}$/.test(expectedSha256) ||
          actualDigest !== expectedSha256 || bytes.length !== stats.size) {
        throw new EvidenceStoreError("Stored evidence failed its integrity check.", "EVIDENCE_INTEGRITY_FAILURE");
      }
      return Object.freeze({ bytes, sha256: actualDigest, sizeBytes: bytes.length });
    },

    async remove(objectKey) {
      const target = objectPath(objectKey);
      try {
        const stats = await lstat(target);
        if (!stats.isFile() || stats.isSymbolicLink()) {
          throw new EvidenceStoreError("The stored evidence object is invalid.", "EVIDENCE_INTEGRITY_FAILURE");
        }
        await rm(target, { force: false });
        return true;
      } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    }
  });
}
