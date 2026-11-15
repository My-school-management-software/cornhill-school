const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const ALLOWED_PORTS = new Set([5432, 54329]);

export function readLocalFinanceRuntimeDatabaseConfig(env = process.env) {
  const rawPassword = env.CORNHILL_DB_FINANCE_RUNTIME_PASSWORD ?? "";
  if (rawPassword.length === 0 || rawPassword.startsWith("REPLACE_WITH_")) return null;

  const host = env.CORNHILL_DB_HOST ?? "127.0.0.1";
  const port = Number(env.CORNHILL_DB_PORT ?? "5432");
  const database = env.CORNHILL_DB_NAME ?? "";
  const password = rawPassword;

  if (!LOOPBACK_HOSTS.has(host)) throw new Error("Finance runtime database host must be loopback-only.");
  if (!Number.isInteger(port) || !ALLOWED_PORTS.has(port)) {
    throw new Error("Finance runtime database must use approved local PostgreSQL port 5432 or isolated CI port 54329.");
  }
  if (database !== "cornhill_local") throw new Error("Finance runtime database must be cornhill_local.");
  if (Buffer.byteLength(password, "utf8") < 32) {
    throw new Error("Finance runtime password must contain at least 32 UTF-8 bytes.");
  }

  return Object.freeze({
    host,
    port,
    database,
    user: "cornhill_finance_api",
    password,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    application_name: "cornhill-finance-api",
    ssl: false
  });
}
