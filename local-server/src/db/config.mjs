const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const ISOLATED_TEST_DATABASE_PATTERN = /^cornhill_isolated_test_[a-f0-9]{32}$/;
const POSTGRES_SYSTEM_IDENTIFIER_PATTERN = /^\d{10,20}$/;

function isAbsoluteDataDirectory(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/");
}

export function readLocalDatabaseConfig(env = process.env) {
  const host = env.CORNHILL_DB_HOST ?? "127.0.0.1";
  const port = Number(env.CORNHILL_DB_PORT ?? "5432");
  const database = env.CORNHILL_DB_NAME ?? "";
  const user = env.CORNHILL_DB_ADMIN_USER ?? "";
  const password = env.CORNHILL_DB_ADMIN_PASSWORD ?? "";
  const target = env.CORNHILL_DB_TARGET ?? "";
  const isolatedTestTarget = target === "isolated-test";

  if (!LOOPBACK_HOSTS.has(host)) throw new Error("Local database host must be loopback-only.");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Local database port must be between 1024 and 65535.");
  if (isolatedTestTarget
    ? !ISOLATED_TEST_DATABASE_PATTERN.test(database)
    : database !== "cornhill_local") {
    throw new Error("Database name must be cornhill_local or an explicitly named isolated-test database.");
  }
  if (isolatedTestTarget) {
    if (host !== "127.0.0.1" || port === 5432) {
      throw new Error("Isolated-test database access requires 127.0.0.1 and a dedicated non-default port.");
    }
    if (!POSTGRES_SYSTEM_IDENTIFIER_PATTERN.test(env.CORNHILL_DB_ISOLATED_SYSTEM_IDENTIFIER ?? "")) {
      throw new Error("Isolated-test PostgreSQL system identifier is required.");
    }
    const serverPort = Number(env.CORNHILL_DB_ISOLATED_SERVER_PORT ?? "");
    if (!Number.isInteger(serverPort) || serverPort < 1024 || serverPort > 65535) {
      throw new Error("Isolated-test PostgreSQL server port is required.");
    }
    if (!isAbsoluteDataDirectory(env.CORNHILL_DB_ISOLATED_DATA_DIRECTORY)) {
      throw new Error("Isolated-test PostgreSQL data directory must be an absolute path.");
    }
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{2,62}$/.test(user)) throw new Error("A valid local database username is required.");
  if (Buffer.byteLength(password, "utf8") < 24 || password.startsWith("REPLACE_WITH_")) throw new Error("Local database password must contain at least 24 bytes.");

  return Object.freeze({
    host, port, database, user, password, max: 5,
    idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000,
    application_name: "cornhill-local-server", ssl: false
  });
}

export function readIsolatedTestDatabaseTarget(env = process.env) {
  if (env.CORNHILL_DB_TARGET !== "isolated-test") return null;
  const config = readLocalDatabaseConfig(env);
  return Object.freeze({
    database: config.database,
    serverPort: Number(env.CORNHILL_DB_ISOLATED_SERVER_PORT),
    systemIdentifier: env.CORNHILL_DB_ISOLATED_SYSTEM_IDENTIFIER,
    dataDirectory: env.CORNHILL_DB_ISOLATED_DATA_DIRECTORY
  });
}
