// Separate read-only CORNHILL working-database inventory.
// Must be run locally by the Director's approved Windows computer.
// Never logs credentials, private IDs, learner details or SQL responses with PII.
import { createRequire } from "node:module";
import { resolve, join, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { getLocalSchoolInventory } from "../src/sync/local-school-inventory.mjs";

const repo = process.env.CORNHILL_LOCAL_REPO;
if (!repo || !isAbsolute(repo)) {
  console.error("LOCAL_INVENTORY=BLOCKED: approved local-server directory required");
  process.exitCode = 1;
} else {
  let pool;
  try {
    const root = resolve(repo);
    const dbModule = await import(pathToFileURL(join(root, "src", "db", "config.mjs")).href);
    const config = dbModule.readLocalDatabaseConfig(process.env);
    if (config.database !== "cornhill_local" || process.env.CORNHILL_DB_TARGET === "isolated-test") {
      throw new Error("wrong database target");
    }
    const requireAtRepo = createRequire(join(root, "package.json"));
    const { Pool } = requireAtRepo("pg");
    pool = new Pool({ ...config, max: 1, application_name: "cornhill-v20-inventory-read-only" });
    const report = await getLocalSchoolInventory(pool);
    console.log("CORNHILL_V20_LOCAL_INVENTORY=PASS");
    for (const [key, count] of Object.entries(report.counts)) console.log(key.toUpperCase() + "=" + count);
    console.log("SOURCE_LINKS_VERIFIED=false");
    console.log("CLOUD_LOCAL_SYNC_VERIFIED=false");
    console.log("DATABASE_WRITES=0");
  } catch {
    // Do not include raw DB errors (which may contain schema details and SQL text).
    console.error("CORNHILL_V20_LOCAL_INVENTORY=BLOCKED");
    console.error("NO_LOCAL_DATA_WAS_CHANGED");
    process.exitCode = 1;
  } finally {
    try { await pool?.end(); } catch { process.exitCode = 1; }
  }
}
