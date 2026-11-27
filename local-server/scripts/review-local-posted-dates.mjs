// Standalone read-only local inventory. Never print raw database errors or secrets.
import { createRequire } from 'node:module';
import { resolve, join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getLocalPostedPaymentDates } from '../src/sync/local-posted-payment-dates.mjs';

const repo = process.env.CORNHILL_LOCAL_REPO;
if (!repo || !isAbsolute(repo)) {
  console.error('CORNHILL_V20_POSTED_DATES=BLOCKED: local repository not specified');
  process.exitCode = 1;
} else {
  let pool;
  try {
    const root = resolve(repo);
    const mod = await import(pathToFileURL(join(root, 'src', 'db', 'config.mjs')).href);
    const config = mod.readLocalDatabaseConfig(process.env);
    if (config.database !== 'cornhill_local' || process.env.CORNHILL_DB_TARGET === 'isolated-test') {
      throw new Error('Wrong database target');
    }
    const requireAtRepo = createRequire(join(root, 'package.json'));
    const { Pool } = requireAtRepo('pg');
    pool = new Pool({ ...config, max: 1, application_name: 'cornhill-v20-posted-dates-read-only' });
    const report = await getLocalPostedPaymentDates(pool);
    console.log('CORNHILL_V20_POSTED_DATES=PASS');
    console.log('LOCAL_POSTED_TOTAL=' + report.postedTotal);
    console.log('UGANDA_TIMEZONE=Africa/Kampala');
    for (const item of report.dates) {
      console.log('LOCAL_DATE_' + item.ugandaDay + '=' + item.postedCount);
    }
    console.log('CLOUD_POSTED_REFERENCE_2026-11-22=7');
    console.log('CLOUD_POSTED_REFERENCE_2026-11-23=1');
    console.log('CLOUD_REFERENCE_IS_SNAPSHOT_NOT_LIVE=true');
    console.log('PAYMENT_IDENTITIES_COMPARED=false');
    console.log('FINANCE_SYNC_ENABLED=false');
    console.log('DATABASE_WRITES=0');
  } catch {
    console.error('CORNHILL_V20_POSTED_DATES=BLOCKED');
    console.error('DATABASE_WRITES=0');
    process.exitCode = 1;
  } finally {
    try { await pool?.end(); } catch { process.exitCode = 1; }
  }
}
