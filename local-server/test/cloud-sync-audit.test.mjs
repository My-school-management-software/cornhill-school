import test from "node:test";
import assert from "node:assert/strict";
import { auditCloudLocalManifests, assessCloudSyncSafety } from "../src/sync/cloud-sync-audit.mjs";

const idA = "01234567-89ab-cdef-0123-456789abcdef";
const idB = "11234567-89ab-cdef-0123-456789abcdef";
const idC = "21234567-89ab-cdef-0123-456789abcdef";
const row = (sourceId, revision = 1, fingerprint = "a".repeat(64)) => ({ sourceId, revision, fingerprint });
const input = (localManifest = [], cloudManifest = [], extras = {}) => ({
  scope: "learner_profile", identityMappingVerified: true, localManifest, cloudManifest, ...extras
});

test("empty manifests are only a metadata comparison, never permission to sync", () => {
  const result = auditCloudLocalManifests(input());
  assert.equal(result.status, "matching_metadata_only");
  assert.equal(result.writesAllowed, false);
  assert.deepEqual(result.operations, []);
});

test("identical authorized metadata compares as matching", () => {
  const result = auditCloudLocalManifests(input([row(idA)], [row(idA)]));
  assert.equal(result.matched, 1);
  assert.equal(result.conflicts, 0);
  assert.equal(result.status, "matching_metadata_only");
});

test("changed digest is reported as conflict, never overwritten", () => {
  const result = auditCloudLocalManifests(input([row(idA)], [row(idA, 1, "b".repeat(64))]));
  assert.equal(result.conflicts, 1);
  assert.equal(result.status, "review_required");
  assert.equal(result.writesAllowed, false);
});

test("changed version is a conflict even when digests match", () => {
  assert.equal(auditCloudLocalManifests(input([row(idA)], [row(idA, 2)])).conflicts, 1);
});

test("missing cloud and local records are counted and not silently inserted", () => {
  const result = auditCloudLocalManifests(input([row(idA), row(idB)], [row(idA), row(idC)]));
  assert.equal(result.matched, 1);
  assert.equal(result.onlyLocal, 1);
  assert.equal(result.onlyCloud, 1);
  assert.equal(result.status, "review_required");
  assert.deepEqual(result.operations, []);
});

test("never returns source identifiers or payloads in audit report", () => {
  const result = auditCloudLocalManifests(input([row(idA), row(idB)], [row(idC)]));
  assert.doesNotMatch(JSON.stringify(result), /01234567-89ab|11234567-89ab|21234567-89ab|first_name|guardian_name/i);
});

test("identity mapping unverified blocks comparison even on equal manifests", () => {
  const result = auditCloudLocalManifests(input([row(idA)], [row(idA)], { identityMappingVerified: "true" }));
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "source_identity_mapping_unverified");
});

test("supports only explicitly non-financial metadata scopes", () => {
  const ok = auditCloudLocalManifests(input([], [], { scope: "assessment_score" }));
  assert.equal(ok.scope, "assessment_score");
  for (const scope of ["finance", "payment", "school_payments", "guardian", "payroll", "learner_delete", "staff", "student", ""]) {
    assert.throws(() => auditCloudLocalManifests(input([], [], { scope })), /Unsupported scope/);
  }
});

test("rejects raw learner or guardian fields", () => {
  assert.throws(() => auditCloudLocalManifests(input([{ ...row(idA), name: "test" }], [])), /only sourceId/);
  assert.throws(() => auditCloudLocalManifests(input([{ ...row(idA), guardianPhone: "test" }], [])), /only sourceId/);
  assert.throws(() => auditCloudLocalManifests(input([{ ...row(idA), password: "test" }], [])), /only sourceId/);
});

test("rejects duplicate cloud source identities", () => {
  assert.throws(() => auditCloudLocalManifests(input([], [row(idA), row(idA)])), /duplicate sourceId/);
});

test("rejects duplicate local source identities", () => {
  assert.throws(() => auditCloudLocalManifests(input([row(idA), row(idA)], [])), /duplicate sourceId/);
});

test("rejects malformed or noncanonical UUIDs", () => {
  for (const id of ["not-a-uuid", idA.toUpperCase(), "", "00112233"]) {
    assert.throws(() => auditCloudLocalManifests(input([row(id)], [])), /canonical lowercase UUID/);
  }
});

test("rejects missing and malformed digests", () => {
  for (const digest of ["f", "A".repeat(64), "", 123, "a".repeat(63)]) {
    assert.throws(() => auditCloudLocalManifests(input([row(idA, 1, digest)], [])), /SHA-256/);
  }
});

test("rejects zero, negative, fractional and noninteger revisions", () => {
  for (const revision of [0, -1, 1.5, "1", NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => auditCloudLocalManifests(input([row(idA, revision)], [])), /positive safe integer/);
  }
});

test("rejects invalid top-level manifests and records", () => {
  for (const bad of [null, {}, "test", 1]) {
    assert.throws(() => auditCloudLocalManifests(input(bad, [])), /must be an array/);
    assert.throws(() => auditCloudLocalManifests(input([bad], [])), /plain object|only sourceId/);
  }
});

test("rejects more than 5000 records, before attempting comparison", () => {
  assert.throws(() => auditCloudLocalManifests(input(new Array(5001), [])), /at most 5000/);
});

test("safety preflight always starts blocked with eight independent proofs", () => {
  const result = assessCloudSyncSafety();
  assert.equal(result.status, "blocked");
  assert.equal(result.missingProofs.length, 8);
  assert.equal(result.cloudLocalWritesEnabled, false);
  assert.equal(result.financeReplicationEnabled, false);
});

test("truthy strings and numbers cannot pass safety checks", () => {
  const result = assessCloudSyncSafety({ sourceIdentityMapping: "true", paymentIdempotencyAndLedger: 1 });
  assert.equal(result.missingProofs.length, 8);
});

test("all reported proofs do not enable synchronization or clear release blockers", () => {
  const checks = ["sourceIdentityMapping", "staffPermissionEquivalence", "guardianScopeIsolation", "revisionAndConflictChecks", "paymentIdempotencyAndLedger", "backupAndRestoreRehearsal", "disconnectAndReplayAcceptance", "multiDeviceAcceptance"];
  const result = assessCloudSyncSafety(Object.fromEntries(checks.map(check => [check, true])));
  assert.equal(result.missingProofs.length, 0);
  assert.equal(result.cloudLocalWritesEnabled, false);
  assert.equal(result.releaseBlockersClearedByThisModule, 0);
  assert.equal(result.status, "proofs_reported_require_independent_acceptance");
});

test("reports are frozen to avoid accidental mutation", () => {
  const result = auditCloudLocalManifests(input([row(idA)], [row(idA)]));
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.operations));
  const gate = assessCloudSyncSafety();
  assert.ok(Object.isFrozen(gate));
  assert.ok(Object.isFrozen(gate.missingProofs));
});

test("rejects extra schema and unknown scopes fail closed", () => {
  assert.throws(() => auditCloudLocalManifests(null), /plain object/);
  assert.throws(() => auditCloudLocalManifests(input([Object.assign(Object.create(null), row(idA), { extra: 1 })], [])), /only sourceId/);
  assert.throws(() => assessCloudSyncSafety(null), /plain object/);
});
