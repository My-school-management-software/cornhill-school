// CORNHILL V2.0: privacy-preserving local posted-payment date inventory.
// The only database read is an aggregate SELECT inside a READ ONLY transaction.
// Reports day and count, never payment IDs, amounts, receipt numbers or learner data.
const QUERY = [
  "SELECT to_char(received_at AT TIME ZONE 'Africa/Kampala', 'YYYY-MM-DD') AS uganda_day,",
  'count(*) AS posted_count',
  'FROM cornhill_school.payment_records',
  "WHERE status = 'Posted'",
  'GROUP BY 1 ORDER BY 1 LIMIT 501'
].join(' ');
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function positiveCount(value) {
  if ((typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') ||
      (typeof value === 'number' && !Number.isSafeInteger(value)) ||
      (typeof value === 'string' && !/^\d+$/.test(value))) {
    throw new TypeError('Invalid posted count');
  }
  const count = BigInt(value);
  if (count <= 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Posted count outside safe range');
  }
  return Number(count);
}

export async function getLocalPostedPaymentDates(pool) {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('PostgreSQL pool required');
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    inTransaction = true;
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    const result = await client.query(QUERY);
    if (!Array.isArray(result?.rows) || result.rows.length > 500) {
      throw new Error('Invalid or excessive date groups');
    }
    const seen = new Set();
    let totalPosted = 0;
    const dates = [];
    for (const row of result.rows) {
      if (typeof row?.uganda_day !== 'string' || !DAY_PATTERN.test(row.uganda_day) ||
          !Number.isFinite(Date.parse(row.uganda_day + 'T00:00:00Z')) ||
          seen.has(row.uganda_day)) {
        throw new Error('Invalid or duplicate date group');
      }
      seen.add(row.uganda_day);
      const postedCount = positiveCount(row.posted_count);
      totalPosted += postedCount;
      if (!Number.isSafeInteger(totalPosted)) throw new RangeError('Total count outside safe range');
      dates.push(Object.freeze({ ugandaDay: row.uganda_day, postedCount }));
    }
    await client.query('ROLLBACK');
    inTransaction = false;
    return Object.freeze({
      status: 'read_only_complete',
      timeZone: 'Africa/Kampala',
      postedTotal: totalPosted,
      dates: Object.freeze(dates),
      matchedCloudPaymentIdentities: false,
      financeSyncEnabled: false,
      databaseWrites: 0
    });
  } catch (err) {
    if (inTransaction) {
      try { await client.query('ROLLBACK'); } catch { /* keep primary error */ }
    }
    throw err;
  } finally {
    client.release();
  }
}
