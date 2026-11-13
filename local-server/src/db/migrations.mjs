import { createHash } from "node:crypto";

export const MIGRATION_LOCK_ID = "70211420261113";

const MIGRATION_FILE_PATTERN = /^\d{3,}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

export function sortMigrationFiles(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError("Migration directory entries must be an array.");
  }
  const sqlFiles = entries.filter(entry => typeof entry === "string" && entry.endsWith(".sql"));
  if (sqlFiles.some(fileName => !MIGRATION_FILE_PATTERN.test(fileName))) {
    throw new Error("Every SQL migration must use a numeric-prefix snake_case filename.");
  }

  const versions = new Set();
  for (const fileName of sqlFiles) {
    const version = fileName.split("_", 1)[0];
    if (versions.has(version)) {
      throw new Error("Migration version prefixes must be unique.");
    }
    versions.add(version);
  }
  return [...sqlFiles].sort((a, b) => a.localeCompare(b));
}

export function migrationChecksum(sql) {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

function stripLeadingSqlComments(sql) {
  let remaining = sql.trimStart();
  while (true) {
    if (remaining.startsWith("--")) {
      const newlineIndex = remaining.search(/\r?\n/);
      if (newlineIndex === -1) return "";
      remaining = remaining.slice(newlineIndex).trimStart();
      continue;
    }
    if (remaining.startsWith("/*")) {
      const endIndex = remaining.indexOf("*/", 2);
      if (endIndex === -1) return remaining;
      remaining = remaining.slice(endIndex + 2).trimStart();
      continue;
    }
    return remaining;
  }
}

export function prepareTransactionalMigration(sql) {
  if (typeof sql !== "string" || sql.trim().length === 0) {
    throw new TypeError("Migration SQL must be a non-empty string.");
  }

  const normalized = stripLeadingSqlComments(sql.replace(/^\uFEFF/, "").trim());
  if (!/^BEGIN;[\s\S]*COMMIT;$/i.test(normalized)) {
    throw new Error("Migration must contain one outer BEGIN/COMMIT transaction.");
  }
  const body = normalized
    .replace(/^BEGIN;\s*/i, "")
    .replace(/\s*COMMIT;$/i, "")
    .trim();

  if (/\b(?:DROP\s+DATABASE|DROP\s+SCHEMA\s+public|TRUNCATE\s+TABLE)\b/i.test(body)) {
    throw new Error("Destructive SQL is not allowed in this local migration runner.");
  }
  return body;
}

export function assertMigrationLedgerRow(row, expectedChecksum, expectedName) {
  if (!row || row.migration_name !== expectedName || row.checksum !== expectedChecksum) {
    throw new Error("Migration ledger mismatch; refusing to continue.");
  }
  return true;
}
