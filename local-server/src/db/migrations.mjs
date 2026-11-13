import { createHash } from "node:crypto";

export const MIGRATION_LOCK_ID = "70211420261113";

export function migrationChecksum(sql) {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

export function prepareTransactionalMigration(sql) {
  if (typeof sql !== "string" || sql.trim().length === 0) {
    throw new TypeError("Migration SQL must be a non-empty string.");
  }

  const normalized = sql.replace(/^\uFEFF/, "").trim();
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
