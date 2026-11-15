const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(label + " must be a UUID.");
  }
}
function conflict(message) {
  const error = new Error(message);
  error.code = "CORNHILL_GUARDIAN_CONFLICT";
  return error;
}
function notFound() {
  const error = new Error("The active guardian contact could not be found.");
  error.code = "CORNHILL_GUARDIAN_NOT_FOUND";
  return error;
}

export function createPostgresGuardianAccessRepository(pool) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") {
    throw new TypeError("A PostgreSQL pool is required.");
  }

  return Object.freeze({
    async listContacts() {
      const result = await pool.query(`
        SELECT
          gc.id::text AS "contactId",
          l.pupil_code AS "pupilCode",
          concat_ws(' ', l.first_name, NULLIF(l.middle_name, ''), l.last_name) AS "learnerName",
          gc.guardian_name AS "guardianName",
          right(gc.phone_e164, 4) AS "phoneLastFour",
          (ga.id IS NOT NULL) AS "accountExists",
          ga.account_status AS "accountStatus",
          COALESCE(access.access_status, 'not_linked') AS "accessStatus"
        FROM cornhill_school.guardian_contacts gc
        INNER JOIN cornhill_school.learners l
          ON l.id = gc.learner_id
        LEFT JOIN cornhill_auth.guardian_accounts ga
          ON ga.phone_e164 = gc.phone_e164
        LEFT JOIN cornhill_auth.guardian_learner_access access
          ON access.guardian_account_id = ga.id
         AND access.learner_id = l.id
        WHERE gc.is_active = true
          AND gc.phone_e164 IS NOT NULL
          AND l.status <> 'Archived'
        ORDER BY l.pupil_code, gc.guardian_name
        LIMIT 300
      `);
      return result.rows;
    },

    async issuePin({ contactId, actorStaffId, pinHash, replaceExisting = false } = {}) {
      assertUuid(contactId, "Guardian contact ID");
      assertUuid(actorStaffId, "Staff actor ID");
      if (typeof pinHash !== "string" || !pinHash.startsWith("$argon2id$") || pinHash.length > 512) {
        throw new TypeError("A valid Argon2id PIN hash is required.");
      }
      if (typeof replaceExisting !== "boolean") {
        throw new TypeError("The PIN replacement flag must be boolean.");
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const contactResult = await client.query(`
          SELECT
            gc.learner_id AS "learnerId",
            gc.guardian_name AS "guardianName",
            gc.phone_e164 AS phone,
            right(gc.phone_e164, 4) AS "phoneLastFour",
            l.pupil_code AS "pupilCode",
            concat_ws(' ', l.first_name, NULLIF(l.middle_name, ''), l.last_name) AS "learnerName"
          FROM cornhill_school.guardian_contacts gc
          INNER JOIN cornhill_school.learners l ON l.id = gc.learner_id
          WHERE gc.id = $1::uuid
            AND gc.is_active = true
            AND gc.phone_e164 IS NOT NULL
            AND l.status <> 'Archived'
          FOR UPDATE OF gc
        `, [contactId]);
        const contact = contactResult.rows[0];
        if (!contact) throw notFound();

        let accountResult = await client.query(
          "SELECT id, account_status FROM cornhill_auth.guardian_accounts WHERE phone_e164 = $1 FOR UPDATE",
          [contact.phone]
        );
        let account = accountResult.rows[0];
        let replacedExistingPin = false;

        if (account && ["suspended", "disabled"].includes(account.account_status)) {
          throw conflict("This guardian account is suspended or disabled. It must be reviewed separately before access can be issued.");
        }
        let pinIssued = true;
        if (account?.account_status === "active" && replaceExisting !== true) {
          // A guardian who already has an active account can be linked to an
          // additional learner without changing credentials used for siblings.
          pinIssued = false;
        }

        if (!account) {
          accountResult = await client.query(`
            INSERT INTO cornhill_auth.guardian_accounts
              (guardian_name, phone_e164, pin_hash, account_status, pin_changed_at)
            VALUES ($1, $2, $3, 'active', now())
            ON CONFLICT (phone_e164) DO NOTHING
            RETURNING id, account_status
          `, [contact.guardianName, contact.phone, pinHash]);
          account = accountResult.rows[0];
          if (!account) {
            throw conflict("The guardian account changed during issuance. Refresh the guardian contact list and try again.");
          }
        } else if (pinIssued) {
          await client.query(`
            UPDATE cornhill_auth.guardian_accounts
            SET pin_hash = $2,
                pin_changed_at = now(),
                account_status = 'active',
                updated_at = now()
            WHERE id = $1::uuid
          `, [account.id, pinHash]);
          replacedExistingPin = account.account_status === "active";
        }

        await client.query(`
          INSERT INTO cornhill_auth.guardian_learner_access
            (guardian_account_id, learner_id, access_status,
             approved_by_staff_id, approved_at, revoked_at)
          VALUES ($1::uuid, $2::uuid, 'approved', $3::uuid, now(), NULL)
          ON CONFLICT (guardian_account_id, learner_id)
          DO UPDATE SET
            access_status = 'approved',
            approved_by_staff_id = EXCLUDED.approved_by_staff_id,
            approved_at = now(),
            revoked_at = NULL
        `, [account.id, contact.learnerId, actorStaffId]);

        await client.query(`
          INSERT INTO cornhill_auth.security_audit_events
            (actor_type, actor_id, event_code, target_type, target_id,
             outcome, details)
          VALUES ('staff', $1::uuid, 'guardian_pin_issued_and_access_approved',
                  'learner', $2::uuid, 'success', $3::jsonb)
        `, [actorStaffId, contact.learnerId, JSON.stringify({
          guardianAccountId: account.id,
          guardianContactId: contactId,
          replacedExistingPin
        })]);

        await client.query("COMMIT");
        return Object.freeze({
          learner: Object.freeze({ pupilCode: contact.pupilCode, learnerName: contact.learnerName }),
          guardian: Object.freeze({ guardianName: contact.guardianName, phoneLastFour: contact.phoneLastFour }),
          pinIssuedAt: new Date().toISOString(),
          replacedExistingPin,
          pinIssued
        });
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        if (error?.code === "23505") {
          throw conflict("The guardian account or access link changed concurrently. Refresh and try again.");
        }
        throw error;
      } finally {
        client.release();
      }
    }
  });
}
