const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function readLocalRuntimeDatabaseConfig(env = process.env) {
  const host = env.CORNHILL_DB_HOST ?? "127.0.0.1";
  const port = Number(env.CORNHILL_DB_PORT ?? "54329");
  const database = env.CORNHILL_DB_NAME ?? "";
  const user = env.CORNHILL_DB_RUNTIME_USER ?? "";
  const password = env.CORNHILL_DB_RUNTIME_PASSWORD ?? "";

  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error("Local runtime database host must be loopback-only.");
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Local runtime database port must be between 1024 and 65535.");
  }
  if (database !== "cornhill_local") {
    throw new Error("Runtime database name must be the isolated cornhill_local database.");
  }
  if (user !== "cornhill_auth_api") {
    throw new Error("Runtime database user must be the dedicated cornhill_auth_api role.");
  }
  if (Buffer.byteLength(password, "utf8") < 32) {
    throw new Error("Runtime database password must contain at least 32 UTF-8 bytes.");
  }

  return Object.freeze({
    host,
    port,
    database,
    user,
    password,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    application_name: "cornhill-auth-api",
    ssl: false
  });
}