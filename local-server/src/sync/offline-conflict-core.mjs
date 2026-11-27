// CORNHILL V2.1: fail-closed three-way conflict classification for future offline sync.
// Pure decision logic only. No network calls, local DB access, queues or writes.
const ALLOWED_SCOPES = new Set(['learner_profile', 'assessment_score']);
const HEX_SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const META_KEYS = new Set(['sourceId', 'revision', 'fingerprint']);
const INPUT_KEYS = new Set(['scope', 'permissionsVerified', 'snapshotConsistent', 'baseline', 'local', 'cloud']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function requireRecord(value, label, keys) {
  if (!isRecord(value)) throw new TypeError(label + ' must be a plain object');
  if (Object.keys(value).some(key => !keys.has(key))) {
    throw new TypeError(label + ' includes an unsupported field');
  }
}
function parseVersion(value, label) {
  if (value === null) return null;
  requireRecord(value, label, META_KEYS);
  if (Object.keys(value).length !== 3 || typeof value.sourceId !== 'string' ||
      !UUID.test(value.sourceId) || !Number.isSafeInteger(value.revision) ||
      value.revision < 1 || typeof value.fingerprint !== 'string' ||
      !HEX_SHA256.test(value.fingerprint)) {
    throw new TypeError(label + ' requires sourceId, positive revision and keyed SHA-256 fingerprint');
  }
  return value;
}
function equal(a, b) {
  return a !== null && b !== null &&
    a.revision === b.revision && a.fingerprint === b.fingerprint;
}
function result(status, reason) {
  return Object.freeze({
    phase: 'v21-offline-conflict-classification',
    status,
    reason,
    writesAllowed: false,
    automaticMergeAllowed: false,
    paymentSyncAllowed: false,
    recordIdentifiersDisclosed: false
  });
}
/**
 * Classifies one record with a previously accepted baseline and two fresh
 * permission-checked snapshots. This never authorizes a write.
 * Authentication, role scope and snapshot consistency must be enforced upstream.
 * No implicit delete/creation, payment modification or last-writer-wins.
 */
export function classifyOfflineChange(input) {
  requireRecord(input, 'input', INPUT_KEYS);
  if (!ALLOWED_SCOPES.has(input.scope)) {
    throw new TypeError('Scope not enabled for offline conflict classification');
  }
  const baseline = parseVersion(input.baseline, 'baseline');
  const local = parseVersion(input.local, 'local');
  const cloud = parseVersion(input.cloud, 'cloud');
  if (input.permissionsVerified !== true) return result('blocked', 'permissions_not_verified');
  if (input.snapshotConsistent !== true) return result('blocked', 'snapshots_not_consistent');
  if (!baseline) return result('manual_review', 'no_accepted_common_baseline');
  if (!local || !cloud) return result('manual_review', 'missing_record_no_automatic_delete_or_create');
  if (baseline.sourceId !== local.sourceId || baseline.sourceId !== cloud.sourceId) {
    return result('blocked', 'source_identity_mismatch');
  }
  if (local.revision < baseline.revision || cloud.revision < baseline.revision) {
    return result('blocked', 'revision_rollback_detected');
  }
  if (equal(local, cloud)) {
    if (equal(local, baseline)) return result('in_sync', 'same_as_accepted_baseline');
    return result('review_required', 'matching_current_metadata_requires_acceptance');
  }
  if (equal(local, baseline) && !equal(cloud, baseline)) {
    return result('review_required', 'cloud_changed_since_baseline');
  }
  if (equal(cloud, baseline) && !equal(local, baseline)) {
    return result('review_required', 'local_changed_since_baseline');
  }
  if (local.revision === cloud.revision && local.fingerprint !== cloud.fingerprint) {
    return result('manual_conflict', 'same_revision_different_content');
  }
  return result('manual_conflict', 'both_sides_differ_from_baseline');
}
