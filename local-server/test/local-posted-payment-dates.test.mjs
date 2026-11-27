import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocalPostedPaymentDates } from '../src/sync/local-posted-payment-dates.mjs';

function mockPool(rows = [
  {uganda_day: '2026-11-22', posted_count: '7'},
  {uganda_day: '2026-11-23', posted_count: '2'}
], fail = false) {
  const commands = [];
  let released = false;
  return {
    pool: { async connect() { return { async query(sql) {
      commands.push(sql);
      if (fail && sql.startsWith('SELECT')) throw new Error('Synthetic read failure');
      return sql.startsWith('SELECT') ? { rows } : { rows: [] };
    }, release() { released = true; } }; } },
    commands, wasReleased() { return released; }
  };
}

test('groups only posted payments by Uganda calendar day', async () => {
  const m = mockPool(); const r = await getLocalPostedPaymentDates(m.pool);
  assert.equal(r.status, 'read_only_complete');
  assert.equal(r.postedTotal, 9);
  assert.deepEqual(r.dates, [
    {ugandaDay:'2026-11-22', postedCount:7},
    {ugandaDay:'2026-11-23', postedCount:2}
  ]);
  assert.equal(r.financeSyncEnabled, false);
  assert.equal(r.matchedCloudPaymentIdentities, false);
  assert.equal(r.databaseWrites, 0);
});

test('only SELECT and session-local controls are issued in READ ONLY transaction', async () => {
  const m = mockPool(); await getLocalPostedPaymentDates(m.pool);
  assert.equal(m.commands[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(m.commands[1], "SET LOCAL statement_timeout = '5000ms'");
  assert.match(m.commands[2], /WHERE status = 'Posted'/);
  assert.match(m.commands[2], /Africa\/Kampala/);
  assert.equal(m.commands[3], 'ROLLBACK');
  assert.equal(m.wasReleased(), true);
  assert.doesNotMatch(m.commands[2], /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|COPY)\b/i);
});

test('does not output private payment IDs, amounts, receipts, names or credentials', async () => {
  const r = await getLocalPostedPaymentDates(mockPool().pool);
  assert.doesNotMatch(JSON.stringify(r), /payment_id|receipt_no|amount_ugx|learner_id|student_id|password|secret/i);
  assert.ok(Object.isFrozen(r));
  assert.ok(Object.isFrozen(r.dates));
  assert.ok(Object.isFrozen(r.dates[0]));
});

test('empty posted payments are supported but never imply reconciliation', async () => {
  const r = await getLocalPostedPaymentDates(mockPool([]).pool);
  assert.equal(r.postedTotal, 0);
  assert.equal(r.dates.length, 0);
  assert.equal(r.matchedCloudPaymentIdentities, false);
});

test('duplicate or invalid date groups cause rollback', async () => {
  for (const rows of [
    [{uganda_day:'2026-11-22',posted_count:'1'}, {uganda_day:'2026-11-22',posted_count:'2'}],
    [{uganda_day:'2026-xx-22',posted_count:'1'}],
    [{uganda_day:null,posted_count:'1'}]
  ]) {
    const m=mockPool(rows);
    await assert.rejects(getLocalPostedPaymentDates(m.pool));
    assert.equal(m.commands.at(-1),'ROLLBACK');
    assert.equal(m.wasReleased(),true);
  }
});

test('invalid counts cause rollback', async () => {
  for (const count of [-1, '0', 'NaN', '1.2', null, '9999999999999999999999']) {
    const m=mockPool([{uganda_day:'2026-11-22',posted_count:count}]);
    await assert.rejects(getLocalPostedPaymentDates(m.pool));
    assert.equal(m.commands.at(-1),'ROLLBACK');
  }
});

test('read error always rolls back and releases connection', async () => {
  const m=mockPool(undefined,true);
  await assert.rejects(getLocalPostedPaymentDates(m.pool), /Synthetic read failure/);
  assert.equal(m.commands.at(-1),'ROLLBACK');
  assert.equal(m.wasReleased(),true);
});

test('invalid result structure is rejected', async () => {
  for(const rows of [undefined, new Array(501).fill({uganda_day:'2026-11-22',posted_count:'1'})]) {
    const m=mockPool(rows);
    if(rows===undefined) m.pool.connect=async()=>({query:async sql=>sql.startsWith('SELECT')?{}:{rows:[]},release(){}});
    await assert.rejects(getLocalPostedPaymentDates(m.pool));
  }
});

test('pool must implement connect', async () => {
  await assert.rejects(getLocalPostedPaymentDates(null), /PostgreSQL pool required/);
  await assert.rejects(getLocalPostedPaymentDates({query(){}}), /PostgreSQL pool required/);
});
