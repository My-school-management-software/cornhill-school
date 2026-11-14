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
    async setLocalExpenseOperatorLimit({actorStaffId,staffId,dailyLimitUgx}) {
      assertUuid(actorStaffId,"Expense limit actor ID"); assertUuid(staffId,"Expense limit staff ID");
      if(!Number.isSafeInteger(dailyLimitUgx)||dailyLimitUgx<=0) throw new TypeError("Daily expense limit must be a positive whole-UGX amount.");
      const result=await pool.query("SELECT cornhill_school.set_local_expense_operator_limit($1::uuid,$2::uuid,$3::bigint) AS id",[actorStaffId,staffId,dailyLimitUgx]);
      return result.rows[0]?.id ?? null;
    },
    async createLocalBankAccount({actorStaffId,accountName,bankName,last4,openingBalanceUgx}) {
      assertUuid(actorStaffId,"Bank account actor ID");
      const result=await pool.query("SELECT cornhill_school.create_local_bank_account($1::uuid,$2::text,$3::text,$4::text,$5::bigint) AS id",[actorStaffId,accountName,bankName,last4,openingBalanceUgx]);
      return result.rows[0]?.id ?? null;
    },
    async createLocalExpenseRequest({actorStaffId,requestNumber,categoryId,description,amountUgx}) {
      assertUuid(actorStaffId,"Expense requester ID"); assertUuid(categoryId,"Expense category ID");
      const result=await pool.query("SELECT cornhill_school.create_local_expense_request($1::uuid,$2::text,$3::uuid,$4::text,$5::bigint) AS id",[actorStaffId,requestNumber,categoryId,description,amountUgx]);
      return result.rows[0]?.id ?? null;
    },
    async reviewLocalExpenseRequest({actorStaffId,requestId,decision,note}) {
      assertUuid(actorStaffId,"Expense reviewer ID"); assertUuid(requestId,"Expense request ID");
      const result=await pool.query("SELECT cornhill_school.review_local_expense_request($1::uuid,$2::uuid,$3::text,$4::text) AS status",[actorStaffId,requestId,decision,note??null]);
      return result.rows[0]?.status ?? null;
    },
    async postLocalExpense({actorStaffId,requestId}) {
      assertUuid(actorStaffId,"Expense poster ID"); assertUuid(requestId,"Expense request ID");
      const result=await pool.query("SELECT cornhill_school.post_local_expense($1::uuid,$2::uuid) AS ledger_id",[actorStaffId,requestId]);
      return result.rows[0]?.ledger_id ?? null;
    },
    async createLocalBankTransaction({actorStaffId,accountId,transactionType,amountUgx,description,externalReference}) {
      assertUuid(actorStaffId,"Bank transaction actor ID"); assertUuid(accountId,"Bank account ID");
      const result=await pool.query("SELECT cornhill_school.create_local_bank_transaction($1::uuid,$2::uuid,$3::text,$4::bigint,$5::text,$6::text) AS id",[actorStaffId,accountId,transactionType,amountUgx,description,externalReference??null]);
      return result.rows[0]?.id ?? null;
    },
    async reviewLocalBankTransaction({actorStaffId,transactionId,decision,note}) {
      assertUuid(actorStaffId,"Bank reviewer ID"); assertUuid(transactionId,"Bank transaction ID");
      const result=await pool.query("SELECT cornhill_school.review_local_bank_transaction($1::uuid,$2::uuid,$3::text,$4::text) AS status",[actorStaffId,transactionId,decision,note??null]);
      return result.rows[0]?.status ?? null;
    },
    async verifyLocalBankTransaction({actorStaffId,transactionId}) {
      assertUuid(actorStaffId,"Bank verifier ID"); assertUuid(transactionId,"Bank transaction ID");
      const result=await pool.query("SELECT cornhill_school.verify_local_bank_transaction($1::uuid,$2::uuid) AS ledger_id",[actorStaffId,transactionId]);
      return result.rows[0]?.ledger_id ?? null;
    },
    async attachLocalFinanceEvidence({actorStaffId,contextType,recordId,evidenceRequestId}) {
      assertUuid(actorStaffId,"Finance evidence actor ID"); assertUuid(recordId,"Finance record ID"); assertUuid(evidenceRequestId,"Evidence request ID");
      const result=await pool.query("SELECT cornhill_school.attach_local_finance_evidence($1::uuid,$2::text,$3::uuid,$4::uuid) AS evidence_request_id",[actorStaffId,contextType,recordId,evidenceRequestId]);
      return result.rows[0]?.evidence_request_id ?? null;
    },
    async createEvidenceRequest(input) {
      assertUuid(input.actorStaffId, "Evidence actor ID");
      assertUuid(input.assignedStaffId, "Assigned staff ID");
      const result = await pool.query(
        "SELECT cornhill_school.create_local_evidence_request($1::uuid,$2::uuid,$3::text,$4::text,$5::uuid,$6::text,$7::bigint) AS request_id",
        [input.actorStaffId,input.assignedStaffId,input.purpose,input.contextType,input.contextRecordId,input.contextLabel,input.amountUgx]
      );
      return result.rows[0]?.request_id ?? null;
    },
    async registerEvidenceFile(input) {
      assertUuid(input.actorStaffId, "Evidence actor ID");
      assertUuid(input.requestId, "Evidence request ID");
      assertUuid(input.objectKey, "Evidence storage object key");
      const result = await pool.query(
        "SELECT cornhill_school.register_local_evidence_file($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::bigint,$7::text) AS file_id",
        [input.actorStaffId,input.requestId,input.objectKey,input.sha256,input.contentType,input.sizeBytes,input.originalFileName]
      );
      return result.rows[0]?.file_id ?? null;
    },
    async submitEvidenceRequest({actorStaffId,requestId}) {
      assertUuid(actorStaffId,"Evidence actor ID"); assertUuid(requestId,"Evidence request ID");
      const result=await pool.query("SELECT cornhill_school.submit_local_evidence_request($1::uuid,$2::uuid) AS request_id",[actorStaffId,requestId]);
      return result.rows[0]?.request_id ?? null;
    },
    async reviewEvidenceRequest({actorStaffId,requestId,action,note}) {
      assertUuid(actorStaffId,"Evidence reviewer ID"); assertUuid(requestId,"Evidence request ID");
      const result=await pool.query("SELECT cornhill_school.review_local_evidence_request($1::uuid,$2::uuid,$3::text,$4::text) AS status",[actorStaffId,requestId,action,note]);
      return result.rows[0]?.status ?? null;
    },
    async getEvidenceRequest({actorStaffId,requestId}) {
      assertUuid(actorStaffId,"Evidence actor ID"); assertUuid(requestId,"Evidence request ID");
      const result=await pool.query("SELECT cornhill_school.finance_get_evidence_request($1::uuid,$2::uuid) AS request",[actorStaffId,requestId]);
      const row=result.rows[0]?.request;
      if (!row || typeof row !== "object") return null;
      // Storage object keys are private implementation details; downloads use the
      // separate actor-scoped lookup routine and never expose keys in JSON responses.
      const files = Array.isArray(row.files) ? row.files.map(file => {
        const { storage_object_key: _privateKey, ...publicMetadata } = file;
        return publicMetadata;
      }) : [];
      return { ...row, files };
    },
    async findEvidenceFile({actorStaffId,fileId}) {
      assertUuid(actorStaffId,"Evidence actor ID"); assertUuid(fileId,"Evidence file ID");
      const result=await pool.query(
        "SELECT cornhill_school.finance_get_evidence_file($1::uuid,$2::uuid) AS file",
        [actorStaffId,fileId]
      );
      const row=result.rows[0]?.file;
      return row?{
        storageObjectKey:row.storage_object_key,sha256:row.sha256,
        contentType:row.content_type,originalFileName:row.original_file_name
      }:null;
    },

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
