import test from "node:test";
import assert from "node:assert/strict";
import { createLocalAuthRuntime } from "../src/security/auth-runtime.mjs";

const ENV = {
  CORNHILL_DB_HOST: "127.0.0.1",
  CORNHILL_DB_PORT: "54329",
  CORNHILL_DB_NAME: "cornhill_local",
  CORNHILL_DB_RUNTIME_USER: "cornhill_auth_api",
  CORNHILL_DB_RUNTIME_PASSWORD: "local-runtime-test-password-long-enough",
  CORNHILL_AUTH_FINGERPRINT_SECRET: "local-test-fingerprint-secret-contains-at-least-32-bytes",
  CORNHILL_LOCAL_ORIGIN: "https://cornhill.local"
};
const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0$ZHVtbXl2YWx1ZQ";

function poolFixture({ user = "cornhill_auth_api", database = "cornhill_local", failQuery = false } = {}) {
  const calls = { ended: 0, released: 0, config: null };
  const pool = {
    async connect() {
      return {
        async query() {
          if (failQuery) throw new Error("private database error");
          return { rows: [{ database_user: user, database_name: database }] };
        },
        release() { calls.released += 1; }
      };
    },
    async query() { return { rows: [], rowCount: 0 }; },
    async end() { calls.ended += 1; }
  };
  return {
    calls,
    poolFactory: async config => {
      calls.config = config;
      return pool;
    }
  };
}

function hasherFactory() {
  return async () => ({
    isArgon2idHash(hash) {
      return typeof hash === "string" && hash.startsWith("$argon2id$");
    },
    async createDummyHash() { return DUMMY_HASH; },
    async verify() { return false; }
  });
}

test("runtime requires private DB and fingerprint configuration", async () => {
  await assert.rejects(
    createLocalAuthRuntime({ env: { ...ENV, CORNHILL_DB_RUNTIME_USER: "cornhill_local_admin" } }),
    /dedicated cornhill_auth_api/
  );
  await assert.rejects(
    createLocalAuthRuntime({ env: { ...ENV, CORNHILL_AUTH_FINGERPRINT_SECRET: "short" } }),
    /at least 32 bytes/
  );
  await assert.rejects(
    createLocalAuthRuntime({
      env: { ...ENV, CORNHILL_AUTH_FINGERPRINT_SECRET: "REPLACE_WITH_A_LONG_RANDOM_SECRET" }
    }),
    /at least 32 bytes/
  );
});
test("runtime refuses an HTTP origin", async () => {
  const fixture = poolFixture();
  await assert.rejects(
    createLocalAuthRuntime({
      env: { ...ENV, CORNHILL_LOCAL_ORIGIN: "http://cornhill.local" },
      poolFactory: fixture.poolFactory,
      passwordHasherFactory: hasherFactory()
    }),
    /could not start/
  );
  assert.equal(fixture.calls.ended, 1);
});
test("runtime connects only as dedicated auth API user", async () => {
  const fixture = poolFixture();
  const runtime = await createLocalAuthRuntime({
    env: ENV,
    poolFactory: fixture.poolFactory,
    passwordHasherFactory: hasherFactory()
  });
  assert.equal(fixture.calls.config.user, "cornhill_auth_api");
  assert.equal(fixture.calls.config.database, "cornhill_local");
  assert.equal(runtime.databaseUser, "cornhill_auth_api");
  assert.equal(fixture.calls.released, 1);
  await runtime.close();
  assert.equal(fixture.calls.ended, 1);
});
test("runtime refuses a database administrator connection", async () => {
  const fixture = poolFixture({ user: "cornhill_local_admin" });
  await assert.rejects(
    createLocalAuthRuntime({
      env: ENV,
      poolFactory: fixture.poolFactory,
      passwordHasherFactory: hasherFactory()
    }),
    /could not start/
  );
  assert.equal(fixture.calls.ended, 1);
});
test("runtime refuses any database other than cornhill_local", async () => {
  const fixture = poolFixture({ database: "postgres" });
  await assert.rejects(
    createLocalAuthRuntime({
      env: ENV,
      poolFactory: fixture.poolFactory,
      passwordHasherFactory: hasherFactory()
    }),
    /could not start/
  );
  assert.equal(fixture.calls.ended, 1);
});
test("runtime fails closed when the database cannot be reached", async () => {
  const fixture = poolFixture({ failQuery: true });
  await assert.rejects(
    createLocalAuthRuntime({
      env: ENV,
      poolFactory: fixture.poolFactory,
      passwordHasherFactory: hasherFactory()
    }),
    /could not start/
  );
  assert.equal(fixture.calls.ended, 1);
});
test("runtime refuses an invalid Argon2id dummy hash", async () => {
  const fixture = poolFixture();
  await assert.rejects(
    createLocalAuthRuntime({
      env: ENV,
      poolFactory: fixture.poolFactory,
      passwordHasherFactory: async () => ({
        isArgon2idHash() { return false; },
        async createDummyHash() { return "not-a-hash"; },
        async verify() { return false; }
      })
    }),
    /could not start/
  );
  assert.equal(fixture.calls.ended, 1);
});
test("runtime close is safe to call more than once", async () => {
  const fixture = poolFixture();
  const runtime = await createLocalAuthRuntime({
    env: ENV,
    poolFactory: fixture.poolFactory,
    passwordHasherFactory: hasherFactory()
  });
  await runtime.close();
  await runtime.close();
  assert.equal(fixture.calls.ended, 1);
});
test("runtime returns the protected HTTPS auth handler without enabling a listener", async () => {
  const fixture = poolFixture();
  const runtime = await createLocalAuthRuntime({
    env: ENV,
    poolFactory: fixture.poolFactory,
    passwordHasherFactory: hasherFactory()
  });
  assert.equal(typeof runtime.authHandler, "function");
  await runtime.close();
});
