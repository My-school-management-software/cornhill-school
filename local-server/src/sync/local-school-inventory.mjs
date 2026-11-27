// CORNHILL V2.0 – local PostgreSQL inventory only.
// Pure aggregate SELECTs in a repeatable-read, read-only transaction.
// No learner names, codes, UUIDs, passwords or payment amounts are returned.
const SQL = [
 "SELECT",
 " (SELECT count(*) FROM cornhill_school.learners) AS learners,",
 " (SELECT count(*) FROM cornhill_school.learners WHERE source_record_id IS NOT NULL) AS learners_with_source_links,",
 " (SELECT count(*) FROM cornhill_school.learners WHERE source_record_id IS NULL) AS learners_without_source_links,",
 " (SELECT count(*) FROM cornhill_school.classes) AS classes,",
 " (SELECT count(*) FROM cornhill_school.academic_terms) AS academic_terms,",
 " (SELECT count(*) FROM cornhill_school.assessments) AS assessments,",
 " (SELECT count(*) FROM cornhill_school.learner_marks) AS learner_marks,",
 " (SELECT count(*) FROM cornhill_school.guardian_contacts) AS guardian_contacts,",
 " (SELECT count(*) FROM cornhill_school.payment_records) AS payment_records"
].join("\n");

const LABELS = Object.freeze([
  "learners", "learners_with_source_links", "learners_without_source_links",
  "classes", "academic_terms", "assessments", "learner_marks",
  "guardian_contacts", "payment_records"
]);

function safeCount(value) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    throw new TypeError("Database count must be numeric");
  }
  const parsed = typeof value === "bigint" ? value : BigInt(value);
  if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Count outside safe bounds");
  }
  return Number(parsed);
}

/**
 * Designed for one local, director-approved, read-only diagnostic.
 * Credentials and the database connection must be provided by the caller.
 * WARNING: this is NOT authorization to export source ids or start syncing.
 */
export async function getLocalSchoolInventory(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new TypeError("A local PostgreSQL connection pool is required");
  }
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    const result = await client.query(SQL);
    if (!Array.isArray(result?.rows) || result.rows.length !== 1) {
      throw new Error("Local inventory result must contain exactly one row");
    }
    const raw = result.rows[0];
    const counts = {};
    for (const key of LABELS) counts[key] = safeCount(raw[key]);
    if (counts.learners !== counts.learners_with_source_links + counts.learners_without_source_links) {
      throw new Error("Local learner identity count reconciliation failed");
    }
    await client.query("ROLLBACK");
    transactionOpen = false;
    return Object.freeze({
      stage: "cloud-local-inventory-only",
      database: "cornhill_local",
      status: "read_only_complete",
      counts: Object.freeze(counts),
      sourceLinksVerified: false,
      cloudComparisonAccepted: false,
      schoolRecordWrites: 0,
      financeReplicationEnabled: false
    });
  } catch (error) {
    if (transactionOpen) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
