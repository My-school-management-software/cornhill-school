import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocalFinanceStatusAudit } from '../src/sync/local-finance-status-audit.mjs';

const draftExample = { total: '9', draft: '1', posted: '8', voided: '0', reversed: '0' };
function mockPool(row = draftExample, errorAt = '') {
  const commands = [];
  let released = false;
  const client = {
    async query(sql) {
      commands.push(sql);
      if (errorAt && sql.includes(errorAt)) throw new Error('synthetic database error');
      return sql.includes('SELECT') ? { rows: [row] } : { rows: [] };
    },
    release() { released = true; }
  };
  return { pool: { connect: async () => client }, commands, wasReleased: () => released };
}

test('1. One local draft is counted separately from posted records', async () => {
  const p = mockPool();
  const report = await getLocalFinanceStatusAudit(p.pool);
  assert.deepEqual(report.counts, { total: 9, draft: 1, posted: 8, voided: 0, reversed: 0 });
  assert.equal(report.receiptMatchesVerified, false);
  assert.equal(report.financeSyncEnabled, false);
  assert.equal(report.databaseWrites, 0);
  assert.equal(p.wasReleased(), true);
});
test('2. Nine posted local records are not silently treated as matching eight cloud records', async () => {
  const r = await getLocalFinanceStatusAudit(mockPool({total: '9', draft: '0', posted: '9', voided: '0', reversed: '0'}).pool);
  assert.equal(r.counts.posted, 9);
  assert.equal(r.receiptMatchesVerified, false);
});
test('3. Reversal and voided statuses are independent', async () => {
  const r = await getLocalFinanceStatusAudit(mockPool({total: '9', draft: '0', posted: '7', voided: '1', reversed: '1'}).pool);
  assert.equal(r.counts.voided, 1);
  assert.equal(r.counts.reversed, 1);
  assert.equal(r.counts.posted, 7);
});
test('4. Exactly one repeatable-read, read-only transaction and rollback', async () => {
  const p = mockPool();
  await getLocalFinanceStatusAudit(p.pool);
  assert.equal(p.commands[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(p.commands[1], "SET LOCAL statement_timeout = '5000ms'");
  assert.equal(p.commands.at(-1), 'ROLLBACK');
  assert.equal(p.commands.filter(c => c.includes('SELECT')).length, 1);
});
test('5. SQL contains only aggregate counts, no payment identifiers or amounts', async () => {
  const p = mockPool();
  await getLocalFinanceStatusAudit(p.pool);
  const sql = p.commands[2];
  assert.match(sql, /COUNT\(\*\)/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|COPY|ALTER)\b/i);
  assert.doesNotMatch(sql, /\b(?:learner_id|student_id|receipt_no|amount_ugx|payer_name)\b/i);
});
test('6. Mismatched status totals fail and roll back', async () => {
  const p = mockPool({total: '9', draft: '0', posted: '8', voided: '0', reversed: '0'});
  await assert.rejects(getLocalFinanceStatusAudit(p.pool), /does not reconcile/);
  assert.equal(p.commands.at(-1), 'ROLLBACK');
  assert.equal(p.wasReleased(), true);
});
test('7. SQL errors cause rollback without returning partial data', async () => {
  const p = mockPool(draftExample, 'SELECT');
  await assert.rejects(getLocalFinanceStatusAudit(p.pool), /synthetic database error/);
  assert.equal(p.commands.at(-1), 'ROLLBACK');
  assert.equal(p.wasReleased(), true);
});
test('8. Non-numeric or unsafe counts are rejected', async () => {
  for (const v of ['-1', 'NaN', null, '3.5', '9999999999999999999999999']) {
    const p = mockPool({ ...draftExample, total: v });
    await assert.rejects(getLocalFinanceStatusAudit(p.pool));
    assert.equal(p.commands.at(-1), 'ROLLBACK');
  }
});
test('9. Invalid database pool is rejected', async () => {
  await assert.rejects(getLocalFinanceStatusAudit(null), /connection pool/);
  await assert.rejects(getLocalFinanceStatusAudit({ query(){} }), /connection pool/);
});
test('10. Results contain no raw details, IDs, receipt numbers or credentials', async () => {
  const r = await getLocalFinanceStatusAudit(mockPool().pool);
  const text = JSON.stringify(r);
  assert.doesNotMatch(text, /learner_id|student_id|receipt_no|payer_name|password|secret|idempotency_key/i);
  assert.ok(Object.isFrozen(r));
  assert.ok(Object.isFrozen(r.counts));
});
test('11. Zero payments are valid but do not indicate sync acceptance', async () => {
  const r = await getLocalFinanceStatusAudit(mockPool({total:'0',draft:'0',posted:'0',voided:'0',reversed:'0'}).pool);
  assert.equal(r.counts.total, 0);
  assert.equal(r.financeSyncEnabled, false);
});
test('12. Empty or malformed SQL result is rejected', async () => {
  const p = mockPool();
  p.pool.connect = async () => ({ query: async sql => sql.includes('SELECT') ? { rows: [] } : { rows: [] }, release() {} });
  await assert.rejects(getLocalFinanceStatusAudit(p.pool), /Unexpected aggregate/);
});
