const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function readLocalDatabaseConfig(env = process.env) {
  const host = env.CORNHILL_DB_HOST ?? "127.0.0.1";
  const port = Number(env.CORNHILL_DB_PORT ?? "54329");
  const database = env.CORNHILL_DB_NAME ?? "";
  const user = env.CORNHILL_DB_ADMIN_USER ?? "";
  const password = env.CORNHILL_DB_ADMIN_PASSWORD ?? "";

  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error("Local database host must be loopback-only.");
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Local database port must be between 1024 and 65535.");
  }
  if (database !== "cornhill_local") {
    throw new Error("Database name must be the isolated cornhill_local development database.");
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{2,62}$/.test(user)) {
    throw new Error("A valid local database username is required.");
  }
  if (Buffer.byteLength(password, "utf8") < 24 || password.startsWith("REPLACE_WITH_")) {
    throw new Error("Local database password must contain at least 24 bytes.");
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
    application_name: "cornhill-local-server",
    ssl: false
  });
}
