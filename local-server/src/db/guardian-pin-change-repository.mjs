const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PIN = /^[0-9]{8}$/;

function invalidPin() {
  const error = new Error("The current PIN could not be verified.");
  error.code = "CORNHILL_CURRENT_PIN_INVALID";
  return error;
}

export function createPostgresGuardianPinChangeRepository(pool, passwordHasher) {
  if (!pool || typeof pool.connect !== "function" ||
      !passwordHasher || typeof passwordHasher.verify !== "function" ||
      typeof passwordHasher.hash !== "function" ||
      typeof passwordHasher.isArgon2idHash !== "function") {
    throw new TypeError("Guardian PIN repository dependencies are incomplete.");
  }
  return Object.freeze({
    async changeGuardianPin({ guardianAccountId, currentPin, newPin } = {}) {
      if (!UUID.test(guardianAccountId) || !PIN.test(currentPin) ||
          !PIN.test(newPin) || currentPin === newPin) {
        throw new TypeError("Guardian PIN change input is invalid.");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const selected = await client.query(
          "SELECT id, pin_hash AS \"pinHash\", account_status AS \"accountStatus\" FROM cornhill_auth.guardian_accounts WHERE id=$1::uuid FOR UPDATE",
          [guardianAccountId]
        );
        const account = selected.rows[0];
        if (!account || account.accountStatus !== "active" ||
            !passwordHasher.isArgon2idHash(account.pinHash) ||
            await passwordHasher.verify(account.pinHash, currentPin) !== true) {
          throw invalidPin();
        }
        const newHash = await passwordHasher.hash(newPin);
        if (!passwordHasher.isArgon2idHash(newHash)) throw new Error("Unable to protect new guardian credential.");
        const changed = await client.query(
          "UPDATE cornhill_auth.guardian_accounts SET pin_hash=$2, pin_changed_at=now(), updated_at=now() " +
          "WHERE id=$1::uuid AND account_status='active' RETURNING id",
          [guardianAccountId, newHash]
        );
        if (changed.rowCount !== 1) throw invalidPin();
        // Changing a private credential must revoke every previous session.
        await client.query(
          "UPDATE cornhill_auth.auth_sessions SET revoked_at=now() " +
          "WHERE principal_type='guardian' AND guardian_account_id=$1::uuid AND revoked_at IS NULL",
          [guardianAccountId]
        );
        await client.query(
          "INSERT INTO cornhill_auth.security_audit_events " +
          "(actor_type, actor_id, event_code, target_type, target_id, outcome, details) " +
          "VALUES ('guardian', $1::uuid, 'guardian.pin_changed_by_guardian', " +
          "'guardian_account', $1::uuid, 'success', '{}'::jsonb)",
          [guardianAccountId]
        );
        await client.query("COMMIT");
        return true;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    }
  });
}
