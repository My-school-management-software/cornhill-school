import { createHash } from "node:crypto";
import { isIP } from "node:net";

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

/**
 * Refuse a migration-source downgrade or history collision before any DDL.
 * A local computer may have a newer lineage of migration numbers 096–140:
 * a candidate branch reusing 096–100 for different features MUST NOT apply
 * its SQL on that existing database, even when the number of source files
 * happens to match the number of applied migrations.
 */
export function assertMigrationManifestCompatible(sourceDigests, appliedRows) {
  if (!(sourceDigests instanceof Map) || !Array.isArray(appliedRows)) {
    throw new TypeError("Migration source manifest and applied rows are required.");
  }
  const appliedNames = new Set();
  for (const row of appliedRows) {
    const name = row?.migration_name;
    if (typeof name !== "string" || !/^\\d{3,}_[a-z0-9_]+$/.test(name) ||
        typeof row.checksum !== "string" || !/^[a-f0-9]{64}$/.test(row.checksum)) {
      throw new Error("Applied migration ledger contains invalid entries; no migration writes allowed.");
    }
    if (appliedNames.has(name)) {
      throw new Error("Duplicate applied migration names; no migration writes allowed.");
    }
    appliedNames.add(name);
    if (!sourceDigests.has(name)) {
      const prefix = name.split("_", 1)[0];
      const other = [...sourceDigests.keys()].find(key => key.startsWith(prefix + "_"));
      if (other) {
        throw new Error("Migration version collision: applied " + name +
          " differs from candidate " + other + "; keep the installed branch and do not migrate.");
      }
      throw new Error("Applied migration " + name +
        " is missing from this source branch; do not downgrade the database.");
    }
    if (sourceDigests.get(name) !== row.checksum) {
      throw new Error("Migration checksum mismatch for " + name +
        "; do not edit an applied migration or its ledger checksum.");
    }
  }
  return true;
}

function normalizeDataDirectory(value) {
  const normalized = String(value ?? "").replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isAllowedIsolatedPostgresServerAddress(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  const address = value.trim().toLowerCase().replace(/^\\[|\\]$/g, "");
  if (address === "localhost" || address === "::1" || address === "127.0.0.1") return true;

  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    return octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168);
  }
  if (version === 6) {
    if (address.startsWith("::ffff:")) {
      return isAllowedIsolatedPostgresServerAddress(address.slice(7));
    }
    return address.startsWith("fc") || address.startsWith("fd") ||
      address.startsWith("fe8") || address.startsWith("fe9") ||
      address.startsWith("fea") || address.startsWith("feb");
  }
  return false;
}

export function assertIsolatedPostgresServerIdentity(actual, expected) {
  if (!actual || !expected ||
      actual.database !== expected.database ||
      !isAllowedIsolatedPostgresServerAddress(actual.server_address) ||
      Number(actual.port) !== expected.serverPort ||
      String(actual.system_identifier) !== expected.systemIdentifier ||
      normalizeDataDirectory(actual.data_directory) !== normalizeDataDirectory(expected.dataDirectory)) {
    throw new Error("Isolated-test PostgreSQL identity preflight failed.");
  }
  return true;
}
export function assertIsolatedDatabaseIdentity(actual, expected) {
  assertIsolatedPostgresServerIdentity(actual, expected);
  if (Number(actual.user_object_count) !== 0) {
    throw new Error("Isolated-test database is not empty; no migrations were run.");
  }
  return true;
}
