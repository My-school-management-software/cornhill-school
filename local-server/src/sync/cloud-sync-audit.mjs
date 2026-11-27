// CORNHILL V2.0 – read-only cloud/local sync comparison foundation.
// This module does not query, write, authenticate, authorize or synchronize any record.
// Accept only non-identifying metadata assembled through a separate, permission-checked reader.
const SCOPES = new Set(["learner_profile", "assessment_score"]);
const FIELDS = new Set(["sourceId", "revision", "fingerprint"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_MANIFEST = 5000;

function assertPlainRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(label + " must be a plain object");
  }
}

function parseManifest(manifest, name) {
  if (!Array.isArray(manifest) || manifest.length > MAX_MANIFEST) {
    throw new TypeError(name + " must be an array with at most " + MAX_MANIFEST + " metadata records");
  }
  const records = new Map();
  for (const item of manifest) {
    assertPlainRecord(item, name + " item");
    if (Object.keys(item).length !== 3 || Object.keys(item).some(key => !FIELDS.has(key))) {
      throw new TypeError(name + " items may contain only sourceId, revision and fingerprint");
    }
    if (typeof item.sourceId !== "string" || !UUID.test(item.sourceId)) {
      throw new TypeError(name + " sourceId must be a canonical lowercase UUID");
    }
    if (!Number.isSafeInteger(item.revision) || item.revision < 1) {
      throw new TypeError(name + " revision must be a positive safe integer");
    }
    if (typeof item.fingerprint !== "string" || !SHA256.test(item.fingerprint)) {
      throw new TypeError(name + " fingerprint must be a lowercase SHA-256 hex digest");
    }
    if (records.has(item.sourceId)) {
      throw new TypeError(name + " contains a duplicate sourceId");
    }
    records.set(item.sourceId, item);
  }
  return records;
}

/**
 * Compare already-authorized, PII-free manifests. No data, identifiers or records
 * are emitted in the report. Missing/changed records ALWAYS require review;
 * this is NEVER a write plan. Do not use this module as an authorization boundary.
 */
export function auditCloudLocalManifests(input) {
  assertPlainRecord(input, "audit input");
  const { scope, identityMappingVerified, localManifest, cloudManifest } = input;
  if (typeof scope !== "string" || !SCOPES.has(scope)) {
    throw new TypeError("Unsupported scope: only learner_profile and assessment_score metadata can be audited");
  }
  // Validation is intentionally performed even when identity mapping is not yet verified.
  // It prevents an unexpected record payload from being processed or logged.
  const local = parseManifest(localManifest, "localManifest");
  const cloud = parseManifest(cloudManifest, "cloudManifest");
  if (identityMappingVerified !== true) {
    return Object.freeze({
      protocol: "cornhill-sync-audit-v1", scope, status: "blocked",
      reason: "source_identity_mapping_unverified", localCount: local.size,
      cloudCount: cloud.size, writesAllowed: false, operations: Object.freeze([])
    });
  }
  let matched = 0;
  let conflicts = 0;
  let onlyLocal = 0;
  let onlyCloud = 0;
  for (const [id, row] of local) {
    const other = cloud.get(id);
    if (!other) onlyLocal++;
    else if (row.revision === other.revision && row.fingerprint === other.fingerprint) matched++;
    else conflicts++;
  }
  for (const id of cloud.keys()) if (!local.has(id)) onlyCloud++;
  const needsReview = conflicts > 0 || onlyLocal > 0 || onlyCloud > 0;
  return Object.freeze({
    protocol: "cornhill-sync-audit-v1", scope,
    status: needsReview ? "review_required" : "matching_metadata_only",
    localCount: local.size, cloudCount: cloud.size,
    matched, conflicts, onlyLocal, onlyCloud,
    writesAllowed: false, operations: Object.freeze([])
  });
}

const REQUIRED_PROOFS = Object.freeze([
  ["sourceIdentityMapping", "source_identity_mapping_unverified"],
  ["staffPermissionEquivalence", "staff_permission_equivalence_unverified"],
  ["guardianScopeIsolation", "guardian_scope_isolation_unverified"],
  ["revisionAndConflictChecks", "revision_and_conflict_checks_unverified"],
  ["paymentIdempotencyAndLedger", "payment_idempotency_unverified"],
  ["backupAndRestoreRehearsal", "backup_restore_not_accepted"],
  ["disconnectAndReplayAcceptance", "disconnect_replay_not_accepted"],
  ["multiDeviceAcceptance", "multi_device_not_accepted"]
]);

/** This gate reports evidence only; it NEVER turns on sync or release readiness. */
export function assessCloudSyncSafety(evidence = {}) {
  assertPlainRecord(evidence, "evidence");
  const missingProofs = REQUIRED_PROOFS.filter(([key]) => evidence[key] !== true)
    .map(([, code]) => code);
  return Object.freeze({
    phase: "v2-cloud-local-read-only-foundation",
    status: missingProofs.length ? "blocked" : "proofs_reported_require_independent_acceptance",
    missingProofs: Object.freeze(missingProofs),
    cloudLocalWritesEnabled: false,
    automaticConflictResolutionEnabled: false,
    financeReplicationEnabled: false,
    releaseBlockersClearedByThisModule: 0
  });
}
