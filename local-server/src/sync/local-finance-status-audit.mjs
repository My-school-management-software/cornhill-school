// CORNHILL V20 Phase C: payment-status inventory; no rows, amounts or identifiers.
// Only reads cornhill_school.payment_records in a read-only transaction.
const SQL = [
  'SELECT',
  ' COUNT(*) AS total,',
  " COUNT(*) FILTER (WHERE status = 'Draft') AS draft,",
  " COUNT(*) FILTER (WHERE status = 'Posted') AS posted,",
  " COUNT(*) FILTER (WHERE status = 'Voided') AS voided,",
  " COUNT(*) FILTER (WHERE status = 'Reversed') AS reversed",
  'FROM cornhill_school.payment_records'
].join('\n');
const KEYS = Object.freeze(['total', 'draft', 'posted', 'voided', 'reversed']);

function parseCount(value) {
  if (typeof value !== 'string' && typeof value !== 'bigint' && typeof value !== 'number') {
    throw new TypeError('A non-negative integer count was expected');
  }
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new TypeError('A safe integer count was expected');
  }
  if (typeof value === 'string' && !/^\d+$/.test(value)) {
    throw new TypeError('A non-negative integer count was expected');
  }
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Count outside safe range');
  }
  return Number(parsed);
}

export async function getLocalFinanceStatusAudit(pool) {
  if (!pool || typeof pool.connect !== 'function') {
    throw new TypeError('A PostgreSQL connection pool is required');
  }
  const client = await pool.connect();
  let active = false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    active = true;
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    const result = await client.query(SQL);
    if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) {
      throw new Error('Unexpected aggregate result');
    }
    const row = result.rows[0];
    const counts = Object.fromEntries(KEYS.map(key => [key, parseCount(row[key])]));
    if (counts.total !== counts.draft + counts.posted + counts.voided + counts.reversed) {
      throw new Error('Payment-status total does not reconcile');
    }
    await client.query('ROLLBACK');
    active = false;
    return Object.freeze({
      stage: 'local-finance-status-counts-only',
      status: 'read_only_complete',
      counts: Object.freeze(counts),
      identitiesCompared: false,
      paymentValuesCompared: false,
      receiptMatchesVerified: false,
      financeSyncEnabled: false,
      databaseWrites: 0
    });
  } catch (error) {
    if (active) {
      try { await client.query('ROLLBACK'); } catch { /* original failure retained */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
