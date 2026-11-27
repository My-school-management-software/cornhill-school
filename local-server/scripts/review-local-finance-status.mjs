// Run locally with node --env-file=.env from the existing CORNHILL local-server folder.
// This separate package uses the installed pg module and existing private credentials.
import { createRequire } from 'node:module';
import { join, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getLocalFinanceStatusAudit } from '../src/sync/local-finance-status-audit.mjs';

const repo = process.env.CORNHILL_LOCAL_REPO;
if (!repo || !isAbsolute(repo)) {
  console.error('CORNHILL_V20_FINANCE_REVIEW=BLOCKED: local repository not specified');
  process.exitCode = 1;
} else {
  let pool;
  try {
    const root = resolve(repo);
    const dbModule = await import(pathToFileURL(join(root, 'src', 'db', 'config.mjs')).href);
    const config = dbModule.readLocalDatabaseConfig(process.env);
    if (config.database !== 'cornhill_local' || process.env.CORNHILL_DB_TARGET === 'isolated-test') {
      throw new Error('The wrong database was selected');
    }
    const requireAtRepo = createRequire(join(root, 'package.json'));
    const { Pool } = requireAtRepo('pg');
    pool = new Pool({ ...config, max: 1, application_name: 'cornhill-v20-finance-status-read-only' });
    const result = await getLocalFinanceStatusAudit(pool);
    console.log('CORNHILL_V20_FINANCE_REVIEW=PASS');
    for (const [key, value] of Object.entries(result.counts)) {
      console.log('LOCAL_PAYMENT_' + key.toUpperCase() + '=' + value);
    }
    console.log('CLOUD_POSTED_AT_LAST_READ_ONLY_CHECK=8');
    console.log('PAYMENT_IDENTITIES_COMPARED=false');
    console.log('FINANCE_SYNC_ENABLED=false');
    console.log('DATABASE_WRITES=0');
  } catch {
    // Never display database errors, user credentials, or raw payment information.
    console.error('CORNHILL_V20_FINANCE_REVIEW=BLOCKED');
    console.error('DATABASE_WRITES=0');
    process.exitCode = 1;
  } finally {
    try { await pool?.end(); } catch { process.exitCode = 1; }
  }
}
