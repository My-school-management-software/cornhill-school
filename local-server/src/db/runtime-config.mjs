const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const ALLOWED_PORTS = new Set([5432, 54329]);

export function readLocalRuntimeDatabaseConfig(env = process.env) {
  const host = env.CORNHILL_DB_HOST ?? "127.0.0.1";
  const port = Number(env.CORNHILL_DB_PORT ?? "5432");
  const database = env.CORNHILL_DB_NAME ?? "";
  const user = env.CORNHILL_DB_RUNTIME_USER ?? "";
  const password = env.CORNHILL_DB_RUNTIME_PASSWORD ?? "";

  if (!LOOPBACK_HOSTS.has(host)) throw new Error("Local runtime database host must be loopback-only.");
  if (!Number.isInteger(port) || !ALLOWED_PORTS.has(port)) {
    throw new Error("Local runtime database must use approved local PostgreSQL port 5432 or isolated CI port 54329.");
  }
  if (database !== "cornhill_local") throw new Error("Runtime database name must be the isolated cornhill_local database.");
  if (user !== "cornhill_auth_api") throw new Error("Runtime database user must be the dedicated cornhill_auth_api role.");
  if (Buffer.byteLength(password, "utf8") < 32 || password.startsWith("REPLACE_WITH_")) {
    throw new Error("Runtime database password must contain at least 32 UTF-8 bytes.");
  }

  return Object.freeze({
    host, port, database, user, password, max: 5,
    idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000,
    application_name: "cornhill-auth-api", ssl: false
  });
}
