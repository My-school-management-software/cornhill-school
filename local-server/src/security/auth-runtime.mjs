import { readLocalRuntimeDatabaseConfig } from "../db/runtime-config.mjs";
import { createPostgresAuthRepositories } from "../db/auth-repositories.mjs";
import { createArgon2PasswordHasher } from "./argon2-password-hasher.mjs";
import { createAuthService } from "./auth-service.mjs";
import { createAuthHttpHandler } from "./auth-http-handler.mjs";

export async function createLocalAuthRuntime({
  env = process.env,
  poolFactory,
  passwordHasherFactory = createArgon2PasswordHasher
} = {}) {
  const config = readLocalRuntimeDatabaseConfig(env);
  const fingerprintSecret = env.CORNHILL_AUTH_FINGERPRINT_SECRET ?? "";
  if (Buffer.byteLength(fingerprintSecret, "utf8") < 32 || fingerprintSecret.startsWith("REPLACE_WITH_")) {
    throw new TypeError("A private authentication fingerprint secret of at least 32 bytes is required.");
  }
  if (typeof passwordHasherFactory !== "function") {
    throw new TypeError("A password hasher factory is required.");
  }

  let pool;
  try {
    if (poolFactory !== undefined) {
      if (typeof poolFactory !== "function") throw new TypeError("Database pool factory must be a function.");
      pool = await poolFactory(config);
    } else {
      const { Pool } = await import("pg");
      pool = new Pool(config);
    }

    if (!pool || typeof pool.connect !== "function" ||
        typeof pool.query !== "function" || typeof pool.end !== "function") {
      throw new TypeError("Database pool contract is incomplete.");
    }

    const client = await pool.connect();
    let identity;
    try {
      identity = await client.query(
        "SELECT current_user AS database_user, current_database() AS database_name"
      );
    } finally {
      client.release();
    }

    if (identity.rows[0]?.database_user !== "cornhill_auth_api" ||
        identity.rows[0]?.database_name !== "cornhill_local") {
      throw new Error("Local authentication database identity check failed.");
    }

    const passwordHasher = await passwordHasherFactory();
    if (!passwordHasher || typeof passwordHasher.createDummyHash !== "function" ||
        typeof passwordHasher.isArgon2idHash !== "function" ||
        typeof passwordHasher.verify !== "function") {
      throw new TypeError("Argon2id password hasher contract is incomplete.");
    }
    const dummyArgon2idHash = await passwordHasher.createDummyHash();
    if (!passwordHasher.isArgon2idHash(dummyArgon2idHash)) {
      throw new Error("Argon2id dummy hash did not meet the configured policy.");
    }

    const repositories = createPostgresAuthRepositories(pool);
    const authService = createAuthService({
      ...repositories,
      passwordHasher,
      dummyArgon2idHash,
      fingerprintSecret
    });
    const authHandler = createAuthHttpHandler({
      authService,
      expectedOrigin: env.CORNHILL_LOCAL_ORIGIN
    });

    let closed = false;
    return Object.freeze({
      authService,
      authHandler,
      databaseUser: "cornhill_auth_api",
      async close() {
        if (closed) return;
        closed = true;
        await pool.end();
      }
    });
  } catch {
    if (pool && typeof pool.end === "function") {
      try {
        await pool.end();
      } catch {
        // Preserve a generic startup failure without exposing connection details.
      }
    }
    throw new Error("Local authentication runtime could not start. Check the private runtime configuration, role grants and HTTPS origin.");
  }
}