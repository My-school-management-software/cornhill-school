import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readLocalDatabaseConfig } from "../src/db/config.mjs";
import { createPostgresAuthRepositories } from "../src/db/auth-repositories.mjs";

const { Pool } = await import("pg");
const pool = new Pool(readLocalDatabaseConfig());
const repositories = createPostgresAuthRepositories(pool);

const staffId = randomUUID();
const guardianId = randomUUID();
const classId = randomUUID();
const correlationId = randomUUID();
const suffix = randomBytes(8).toString("hex");
const username = "ci_" + suffix;
const phone = "+2567" + randomBytes(4).readUInt32BE(0).toString().padStart(10, "0").slice(0, 8);
const fakeArgon2idHash = "$argon2id$ci-placeholder";
const fingerprints = Array.from({ length: 4 }, (_, index) =>
  createHash("sha256").update("ci-auth-test-" + suffix + "-" + index).digest("hex")
);

try {
  await pool.query(`
    INSERT INTO cornhill_auth.staff_accounts
      (id, username, username_normalized, password_hash, account_status, must_change_password)
    VALUES ($1, $2, $3, $4, 'active', false)
  `, [staffId, username, username, fakeArgon2idHash]);

  await pool.query(`
    INSERT INTO cornhill_auth.staff_role_assignments (staff_account_id, role_code)
    VALUES ($1, 'teacher')
  `, [staffId]);

  await pool.query(`
    INSERT INTO cornhill_auth.staff_class_assignments
      (staff_account_id, class_id, assignment_type)
    VALUES ($1, $2, 'class_teacher')
  `, [staffId, classId]);

  await pool.query(`
    INSERT INTO cornhill_auth.guardian_accounts
      (id, guardian_name, phone_e164, pin_hash, account_status)
    VALUES ($1, 'CI Guardian', $2, $3, 'active')
  `, [guardianId, phone, fakeArgon2idHash]);

  const staff = await repositories.accountRepository.findStaffByUsername(username);
  assert.equal(staff.id, staffId);
  assert.equal(staff.accountStatus, "active");
  assert.deepEqual(staff.roles, ["teacher"]);
  assert.deepEqual(staff.classIds, [classId]);

  const guardian = await repositories.accountRepository.findGuardianByPhone(phone);
  assert.equal(guardian.id, guardianId);
  assert.equal(guardian.accountStatus, "active");
  assert.equal(guardian.pinHash, fakeArgon2idHash);

  const concurrencyIdentifier = fingerprints[0];
  const concurrencySource = fingerprints[1];
  const concurrentAttempts = await Promise.all(
    Array.from({ length: 10 }, () => repositories.loginAttemptStore.beginAttempt({
      principalType: "staff",
      identifierFingerprint: concurrencyIdentifier,
      sourceFingerprint: concurrencySource,
      attemptedAt: new Date(),
      windowMs: 15 * 60 * 1000,
      maxFailedAttempts: 5
    }))
  );
  assert.equal(concurrentAttempts.filter(result => result.allowed).length, 5);
  assert.equal(concurrentAttempts.filter(result => !result.allowed).length, 5);

  const firstAllowed = concurrentAttempts.find(result => result.allowed);
  assert.equal(await repositories.loginAttemptStore.completeAttempt({
    attemptId: firstAllowed.attemptId,
    succeeded: true,
    attemptedAt: new Date()
  }), true);

  const afterSuccess = await repositories.loginAttemptStore.beginAttempt({
    principalType: "staff",
    identifierFingerprint: concurrencyIdentifier,
    sourceFingerprint: concurrencySource,
    attemptedAt: new Date(),
    windowMs: 15 * 60 * 1000,
    maxFailedAttempts: 5
  });
  assert.equal(afterSuccess.allowed, true);
  assert.equal(await repositories.loginAttemptStore.completeAttempt({
    attemptId: afterSuccess.attemptId,
    succeeded: false,
    attemptedAt: new Date()
  }), true);

  const sessionTokenHash = fingerprints[2];
  const csrfTokenHash = fingerprints[3];
  await repositories.sessionRepository.createAuthenticatedSession({
    principalType: "staff",
    accountId: staffId,
    tokenHash: sessionTokenHash,
    csrfTokenHash,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    correlationId
  });

  const storedSession = await repositories.sessionRepository.findActiveSessionByTokenHash(sessionTokenHash);
  assert.equal(storedSession.staffAccountId, staffId);
  assert.equal(storedSession.guardianAccountId, null);
  assert.equal(storedSession.accountStatus, "active");
  assert.equal(storedSession.tokenHash, sessionTokenHash);

  assert.equal(await repositories.sessionRepository.revokeSessionByTokenHash(sessionTokenHash), true);
  assert.equal(await repositories.sessionRepository.findActiveSessionByTokenHash(sessionTokenHash), null);

  const audit = await pool.query(
    "SELECT count(*)::int AS count FROM cornhill_auth.security_audit_events WHERE correlation_id = $1",
    [correlationId]
  );
  assert.equal(audit.rows[0].count, 1);

  console.log("Authentication repositories verified: staff/guardian lookup, concurrent throttling, success accounting, session create/revoke and audit.");
} finally {
  // Delete only the unique disposable fixture rows created by this verifier.
  await pool.query("DELETE FROM cornhill_auth.auth_sessions WHERE staff_account_id = $1 OR guardian_account_id = $2", [staffId, guardianId]);
  await pool.query("DELETE FROM cornhill_auth.staff_class_assignments WHERE staff_account_id = $1", [staffId]);
  await pool.query("DELETE FROM cornhill_auth.staff_role_assignments WHERE staff_account_id = $1", [staffId]);
  await pool.query("DELETE FROM cornhill_auth.security_audit_events WHERE correlation_id = $1", [correlationId]);
  await pool.query("DELETE FROM cornhill_auth.login_attempts WHERE identifier_fingerprint = $1", [fingerprints[0]]);
  await pool.query("DELETE FROM cornhill_auth.staff_accounts WHERE id = $1", [staffId]);
  await pool.query("DELETE FROM cornhill_auth.guardian_accounts WHERE id = $1", [guardianId]);
  await pool.end();
}