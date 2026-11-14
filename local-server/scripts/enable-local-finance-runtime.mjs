import { randomBytes } from "node:crypto";
import { open, readFile, rename, lstat, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { readLocalDatabaseConfig } from "../src/db/config.mjs";

const envPath = resolve(process.cwd(), ".env");
const tempPath = envPath + ".finance-" + randomBytes(8).toString("hex") + ".tmp";
const { Pool } = await import("pg");
const pool = new Pool(readLocalDatabaseConfig());
let roleEnabled = false;

function replaceEnvValue(source, key, value) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  const kept = lines.filter(line => !line.trimStart().startsWith(key + "="));
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  kept.push(key + "=" + value);
  return kept.join("\n") + "\n";
}

try {
  const stat = await lstat(envPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("The local .env must be a regular, non-symlink file.");
  const roles = await pool.query("SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,pg_has_role('cornhill_finance_api','cornhill_finance_runtime','MEMBER') AS member FROM pg_catalog.pg_roles r WHERE r.rolname IN ('cornhill_finance_runtime','cornhill_finance_api')");
  if (roles.rowCount !== 2) throw new Error("Dedicated finance database roles are missing. Run migrations and verification first.");
  const group = roles.rows.find(row => row.rolname === "cornhill_finance_runtime");
  const api = roles.rows.find(row => row.rolname === "cornhill_finance_api");
  if (group.rolcanlogin || group.rolsuper || group.rolcreatedb || group.rolcreaterole || group.rolreplication || group.rolbypassrls) throw new Error("Finance runtime group failed its NOLOGIN least-privilege check.");
  if (api.rolsuper || api.rolcreatedb || api.rolcreaterole || api.rolreplication || api.rolbypassrls || !api.member) throw new Error("Finance API role failed its least-privilege membership check.");
  const password = randomBytes(48).toString("base64url");
  const statement = await pool.query("SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', 'cornhill_finance_api', $1) AS sql", [password]);
  await pool.query(statement.rows[0].sql);
  roleEnabled = true;
  const original = await readFile(envPath, "utf8");
  const updated = replaceEnvValue(original, "CORNHILL_DB_FINANCE_RUNTIME_PASSWORD", password);
  const handle = await open(tempPath, "wx", 0o600);
  try { await handle.writeFile(updated, "utf8"); await handle.sync(); } finally { await handle.close(); }
  await rename(tempPath, envPath);
  roleEnabled = false;
  console.log("Dedicated finance API credential provisioned locally. The generated secret was saved to .env and was not displayed.");
  console.log("Next: run npm run db:verify-finance, then restart the HTTPS service with npm run start:auth.");
} catch {
  if (roleEnabled) { try { await pool.query("ALTER ROLE cornhill_finance_api NOLOGIN PASSWORD NULL"); } catch { /* Keep finance disabled if local persistence failed. */ } }
  try { await unlink(tempPath); } catch { /* Temporary file may not exist. */ }
  console.error("Finance credential provisioning failed safely. The finance API role was returned to NOLOGIN where possible. Check local database administrator configuration and .env permissions; do not share secrets.");
  process.exitCode = 1;
} finally { await pool.end(); }
