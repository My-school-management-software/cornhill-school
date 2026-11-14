const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(label + " must be a valid UUID.");
  }
}

export function createPostgresFinanceRepositories(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("A PostgreSQL finance pool is required.");
  }

  return Object.freeze({
    async searchLearners({ actorStaffId, search }) {
      assertUuid(actorStaffId, "Finance actor ID");
      if (typeof search !== "string") throw new TypeError("Learner search text is required.");
      const result = await pool.query(
        "SELECT * FROM cornhill_school.finance_search_learners($1::uuid, $2::text)",
        [actorStaffId, search]
      );
      return result.rows.map(row => ({
        learnerId: row.learner_id,
        pupilCode: row.pupil_code,
        learnerName: row.learner_name,
        className: row.class_name,
        isBursary: row.is_bursary
      }));
    },

    async getLearnerAccount({ actorStaffId, learnerId }) {
      assertUuid(actorStaffId, "Finance actor ID");
      assertUuid(learnerId, "Learner ID");
      const result = await pool.query(
        "SELECT cornhill_school.finance_get_learner_account($1::uuid, $2::uuid) AS account",
        [actorStaffId, learnerId]
      );
      return result.rows[0]?.account ?? null;
    },

    async postPayment(input) {
      assertUuid(input.actorStaffId, "Finance actor ID");
      assertUuid(input.learnerId, "Learner ID");
      assertUuid(input.idempotencyKey, "Payment idempotency key");
      const result = await pool.query(
        "SELECT * FROM cornhill_school.post_local_payment(" +
        "$1::uuid,$2::uuid,$3::bigint,$4::text,$5::uuid,$6::jsonb,$7::text,$8::text,$9::text,$10::text,$11::text)",
        [
          input.actorStaffId,
          input.learnerId,
          input.amountUgx,
          input.paymentMethod,
          input.idempotencyKey,
          JSON.stringify(input.allocations),
          input.mobileMoneyProvider ?? null,
          input.externalReference ?? null,
          input.collectionItem ?? "School fees",
          input.payerName ?? null,
          input.notes ?? null
        ]
      );
      const row = result.rows[0];
      if (!row) throw new Error("Payment posting returned no result.");
      return {
        paymentId: row.payment_id,
        receiptNumber: row.receipt_number,
        status: row.payment_status,
        allocatedAmountUgx: Number(row.allocated_amount_ugx),
        unallocatedAmountUgx: Number(row.unallocated_amount_ugx),
        receipt: row.receipt_data_snapshot
      };
    }
  });
}
