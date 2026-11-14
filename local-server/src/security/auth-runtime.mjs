import { readLocalRuntimeDatabaseConfig } from "../db/runtime-config.mjs";
import { readLocalFinanceRuntimeDatabaseConfig } from "../db/finance-runtime-config.mjs";
import { createPostgresAuthRepositories } from "../db/auth-repositories.mjs";
import { createPostgresFinanceRepositories } from "../db/finance-repositories.mjs";
import { createArgon2PasswordHasher } from "./argon2-password-hasher.mjs";
import { createAuthService } from "./auth-service.mjs";
import { createAuthHttpHandler } from "./auth-http-handler.mjs";
import { createFinanceHttpHandler } from "./finance-http-handler.mjs";
import { createFinanceOperationsHttpHandler } from "./finance-operations-http-handler.mjs";
import { createEvidenceHttpHandler } from "./evidence-http-handler.mjs";
import { createPrivateEvidenceStore } from "./private-evidence-store.mjs";

export async function createLocalAuthRuntime({
  env = process.env,
  poolFactory,
  financePoolFactory,
  passwordHasherFactory = createArgon2PasswordHasher
} = {}) {
  const config = readLocalRuntimeDatabaseConfig(env);
  const financeConfig = readLocalFinanceRuntimeDatabaseConfig(env);
  const fingerprintSecret = env.CORNHILL_AUTH_FINGERPRINT_SECRET ?? "";
  if (Buffer.byteLength(fingerprintSecret, "utf8") < 32 || fingerprintSecret.startsWith("REPLACE_WITH_")) {
    throw new TypeError("A private authentication fingerprint secret of at least 32 bytes is required.");
  }
  if (typeof passwordHasherFactory !== "function") throw new TypeError("A password hasher factory is required.");

  let pool;
  let financePool;
  let evidenceEnabled = false;
  try {
    const { Pool } = await import("pg");
    if (poolFactory !== undefined && typeof poolFactory !== "function") {
      throw new TypeError("Authentication database pool factory must be a function.");
    }
    pool = poolFactory ? await poolFactory(config) : new Pool(config);
    if (!pool || typeof pool.connect !== "function" || typeof pool.query !== "function" || typeof pool.end !== "function") {
      throw new TypeError("Authentication database pool contract is incomplete.");
    }

    const authClient = await pool.connect();
    let authIdentity;
    try {
      authIdentity = await authClient.query(
        "SELECT current_user AS database_user, current_database() AS database_name"
      );
    } finally {
      authClient.release();
    }
    if (authIdentity.rows[0]?.database_user !== "cornhill_auth_api" ||
        authIdentity.rows[0]?.database_name !== "cornhill_local") {
      throw new Error("Local authentication database identity check failed.");
    }

    const passwordHasher = await passwordHasherFactory();
    if (!passwordHasher || typeof passwordHasher.createDummyHash !== "function" ||
        typeof passwordHasher.isArgon2idHash !== "function" || typeof passwordHasher.verify !== "function") {
      throw new TypeError("Argon2id password hasher contract is incomplete.");
    }
    const dummyArgon2idHash = await passwordHasher.createDummyHash();
    if (!passwordHasher.isArgon2idHash(dummyArgon2idHash)) {
      throw new Error("Argon2id dummy hash did not meet the configured policy.");
    }

    const repositories = createPostgresAuthRepositories(pool);
    const authService = createAuthService({
      ...repositories, passwordHasher, dummyArgon2idHash, fingerprintSecret
    });
    const authRouteHandler = createAuthHttpHandler({
      authService, expectedOrigin: env.CORNHILL_LOCAL_ORIGIN
    });

    let routeHandler = authRouteHandler;
    let financeEnabled = false;
    if (financeConfig) {
      if (financePoolFactory !== undefined && typeof financePoolFactory !== "function") {
        throw new TypeError("Finance database pool factory must be a function.");
      }
      financePool = financePoolFactory ? await financePoolFactory(financeConfig) : new Pool(financeConfig);
      if (!financePool || typeof financePool.connect !== "function" ||
          typeof financePool.query !== "function" || typeof financePool.end !== "function") {
        throw new TypeError("Finance database pool contract is incomplete.");
      }
      const financeClient = await financePool.connect();
      let financeIdentity;
      try {
        financeIdentity = await financeClient.query(
          "SELECT current_user AS database_user, current_database() AS database_name"
        );
      } finally {
        financeClient.release();
      }
      if (financeIdentity.rows[0]?.database_user !== "cornhill_finance_api" ||
          financeIdentity.rows[0]?.database_name !== "cornhill_local") {
        throw new Error("Local finance database identity check failed.");
      }
      const financeRepository = createPostgresFinanceRepositories(financePool);
      const financeOperationsRouteHandler = createFinanceOperationsHttpHandler({
        authService, financeRepository, expectedOrigin: env.CORNHILL_LOCAL_ORIGIN
      });
      const financeRouteHandler = createFinanceHttpHandler({
        authService, financeRepository, expectedOrigin: env.CORNHILL_LOCAL_ORIGIN
      });
      const evidenceRoot = env.CORNHILL_PRIVATE_EVIDENCE_PATH;
      let evidenceRouteHandler = null;
      if (typeof evidenceRoot === "string" && evidenceRoot.trim()) {
        const evidenceStore = await createPrivateEvidenceStore({ rootPath: evidenceRoot });
        evidenceRouteHandler = createEvidenceHttpHandler({
          authService,
          evidenceRepository: financeRepository,
          evidenceStore,
          expectedOrigin: env.CORNHILL_LOCAL_ORIGIN
        });
        evidenceEnabled = true;
      }
      routeHandler = async (request, response) => {
        if (await authRouteHandler(request, response)) return true;
        if (await financeOperationsRouteHandler(request, response)) return true;
        if (await financeRouteHandler(request, response)) return true;
        return evidenceRouteHandler ? evidenceRouteHandler(request, response) : false;
      };
      financeEnabled = true;
    }

    let closed = false;
    return Object.freeze({
      authService,
      authHandler: routeHandler,
      financeEnabled,
      evidenceEnabled,
      databaseUser: "cornhill_auth_api",
      financeDatabaseUser: financeEnabled ? "cornhill_finance_api" : null,
      async close() {
        if (closed) return;
        closed = true;
        const errors = [];
        for (const activePool of [financePool, pool]) {
          if (!activePool) continue;
          try { await activePool.end(); } catch { errors.push(true); }
        }
        if (errors.length) throw new Error("A local database pool could not close cleanly.");
      }
    });
  } catch {
    for (const activePool of [financePool, pool]) {
      if (activePool && typeof activePool.end === "function") {
        try { await activePool.end(); } catch { /* Preserve generic startup failure. */ }
      }
    }
    throw new Error("Local authentication runtime could not start. Check private runtime configuration, database role grants and HTTPS origin.");
  }
}
