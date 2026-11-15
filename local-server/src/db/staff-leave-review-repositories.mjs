const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createPostgresStaffLeaveReviewRepository(pool) {
  if (!pool || typeof pool.connect !== "function") throw new TypeError("A PostgreSQL transaction pool is required.");
  return Object.freeze({
    async reviewRequest({ requestId, reviewerStaffId, decision, note = "" }) {
      if (!UUID.test(requestId ?? "") || !UUID.test(reviewerStaffId ?? "")) throw new TypeError("Leave request and reviewer IDs must be valid.");
      if (!["Approved", "Rejected"].includes(decision)) throw new TypeError("Choose Approved or Rejected.");
      if (typeof note !== "string" || note.trim().length > 1200 || (decision === "Rejected" && note.trim().length < 5)) {
        throw new TypeError("A rejection reason of at least five characters is required; notes may not exceed 1,200 characters.");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          "UPDATE cornhill_school.staff_leave_requests " +
          "SET status=$2, reviewed_by_staff_id=$3::uuid, review_note=$4 " +
          "WHERE id=$1::uuid AND status='Submitted' " +
          "RETURNING id::text AS id,status,reviewed_at AS \"reviewedAt\",review_note AS \"reviewNote\"",
          [requestId, decision, reviewerStaffId, note.trim() || null]
        );
        if (result.rowCount !== 1) {
          const error = new Error("This leave request is no longer awaiting review.");
          error.code = "P0002";
          throw error;
        }
        await client.query("COMMIT");
        return result.rows[0];
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    }
  });
}
