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

    async reprintReceipt({ actorStaffId, receiptNumber, reason }) {
      assertUuid(actorStaffId, "Finance actor ID");
      if (typeof receiptNumber !== "string" || !/^CR-[0-9]{4}-[0-9]{7}$/.test(receiptNumber)) {
        throw new TypeError("Receipt number is invalid.");
      }
      if (typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 300) {
        throw new TypeError("A reprint reason of 5 to 300 characters is required.");
      }
      const result = await pool.query(
        "SELECT cornhill_school.reprint_local_payment_receipt($1::uuid, $2::text, $3::text) AS receipt",
        [actorStaffId, receiptNumber, reason.trim()]
      );
      return result.rows[0]?.receipt ?? null;
    },

    async listLearnerCredits({ actorStaffId, learnerId }) {
      assertUuid(actorStaffId, "Finance actor ID");
      assertUuid(learnerId, "Learner ID");
      const result = await pool.query(
        "SELECT * FROM cornhill_school.finance_list_learner_credit_sources($1::uuid,$2::uuid)",
        [actorStaffId, learnerId]
      );
      return result.rows.map(row => ({
        paymentId: row.payment_id,
        receiptNumber: row.receipt_number,
        amountUgx: Number(row.amount_ugx),
        originalUnallocatedUgx: Number(row.original_unallocated_ugx),
        allocatedCreditUgx: Number(row.allocated_credit_ugx),
        remainingCreditUgx: Number(row.remaining_credit_ugx),
        receivedAt: row.received_at,
        collectionItem: row.collection_item,
        payerName: row.payer_name
      }));
    },

    async getCreditAllocationByKey({ actorStaffId, idempotencyKey }) {
      assertUuid(actorStaffId, "Finance actor ID");
      assertUuid(idempotencyKey, "Credit allocation idempotency key");
      const result = await pool.query(
        "SELECT cornhill_school.finance_get_credit_allocation_by_key($1::uuid,$2::uuid) AS allocation",
        [actorStaffId, idempotencyKey]
      );
      return result.rows[0]?.allocation ?? null;
    },

    async allocateCredit(input) {
      assertUuid(input.actorStaffId, "Finance actor ID");
      assertUuid(input.sourcePaymentId, "Source payment ID");
      assertUuid(input.idempotencyKey, "Credit allocation idempotency key");
      if (!Array.isArray(input.allocations) || input.allocations.length < 1 || input.allocations.length > 100) {
        throw new TypeError("Between 1 and 100 credit allocations are required.");
      }
      if (typeof input.reason !== "string" || input.reason.trim().length < 5 || input.reason.trim().length > 300) {
        throw new TypeError("A credit allocation reason of 5 to 300 characters is required.");
      }
      const result = await pool.query(
        "SELECT cornhill_school.allocate_local_payment_credit($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::text) AS allocation",
        [
          input.actorStaffId,
          input.sourcePaymentId,
          input.idempotencyKey,
          JSON.stringify(input.allocations),
          input.reason.trim()
        ]
      );
      return result.rows[0]?.allocation ?? null;
    },

    async getPaymentByIdempotencyKey({ actorStaffId, idempotencyKey }) {
      assertUuid(actorStaffId, "Finance actor ID");
      assertUuid(idempotencyKey, "Payment idempotency key");
      const result = await pool.query(
        "SELECT cornhill_school.finance_get_payment_by_key($1::uuid,$2::uuid) AS payment",
        [actorStaffId, idempotencyKey]
      );
      return result.rows[0]?.payment ?? null;
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
