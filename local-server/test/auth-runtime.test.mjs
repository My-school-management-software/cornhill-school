import test from "node:test";
import assert from "node:assert/strict";
import { createLocalAuthRuntime } from "../src/security/auth-runtime.mjs";
import { Readable } from "node:stream";

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

function poolFixture({ user = "cornhill_auth_api", database = "cornhill_local", failQuery = false, schemaReady = false } = {}) {
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
    async query(sql) {
      if (String(sql).includes("information_schema.columns")) return { rows: [{ ready: schemaReady }] };
      return { rows: [], rowCount: 0 };
    },
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
    async hash(value) { return "$argon2id$test$" + Buffer.from(value,"utf8").toString("base64url"); },
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
  assert.equal(runtime.financeEnabled, false);
  await runtime.close();
});

function financePoolFixture({ user = "cornhill_finance_api", database = "cornhill_local" } = {}) {
  const calls = { ended: 0, released: 0, config: null };
  const pool = {
    async connect() {
      return {
        async query() { return { rows: [{ database_user: user, database_name: database }] }; },
        release() { calls.released += 1; }
      };
    },
    async query() { return { rows: [], rowCount: 0 }; },
    async end() { calls.ended += 1; }
  };
  return {
    calls,
    financePoolFactory: async config => { calls.config = config; return pool; }
  };
}

test("runtime enables the finance API only with a separate finance-role credential", async () => {
  const auth = poolFixture();
  const finance = financePoolFixture();
  const runtime = await createLocalAuthRuntime({
    env: { ...ENV, CORNHILL_DB_FINANCE_RUNTIME_PASSWORD: "finance-runtime-password-longer-than-32-bytes" },
    poolFactory: auth.poolFactory,
    financePoolFactory: finance.financePoolFactory,
    passwordHasherFactory: hasherFactory()
  });
  assert.equal(runtime.financeEnabled, true);
  assert.equal(runtime.financeDatabaseUser, "cornhill_finance_api");
  assert.equal(finance.calls.config.user, "cornhill_finance_api");
  assert.equal(finance.calls.config.database, "cornhill_local");
  assert.equal(finance.calls.released, 1);
  await runtime.close();
  assert.equal(auth.calls.ended, 1);
  assert.equal(finance.calls.ended, 1);
});

test("runtime fails closed and closes both pools when finance connects as the wrong identity", async () => {
  const auth = poolFixture();
  const finance = financePoolFixture({ user: "cornhill_local_admin" });
  await assert.rejects(createLocalAuthRuntime({
    env: { ...ENV, CORNHILL_DB_FINANCE_RUNTIME_PASSWORD: "finance-runtime-password-longer-than-32-bytes" },
    poolFactory: auth.poolFactory,
    financePoolFactory: finance.financePoolFactory,
    passwordHasherFactory: hasherFactory()
  }), /could not start/);
  assert.equal(auth.calls.ended, 1);
  assert.equal(finance.calls.ended, 1);
});

test("V21 offline mark preview is disabled by default, including unrelated env flags", async () => {
  for (const value of [undefined, "", "true", "enabled", "1"]) {
    const fixture = poolFixture({ schemaReady: true });
    const runtime = await createLocalAuthRuntime({
      env: {...ENV, CORNHILL_OFFLINE_DRAFT_ELIGIBILITY: value},
      poolFactory: fixture.poolFactory,
      passwordHasherFactory: hasherFactory()
    });
    assert.equal(runtime.offlineDraftEligibilityEnabled, false);
    await runtime.close();
  }
});
test("V21 offline preview refuses activation when schema migration 096 is absent", async () => {
  const fixture = poolFixture({ schemaReady: false });
  await assert.rejects(createLocalAuthRuntime({
    env: {...ENV, CORNHILL_OFFLINE_DRAFT_ELIGIBILITY: "read-only-v21"},
    poolFactory: fixture.poolFactory,
    passwordHasherFactory: hasherFactory()
  }), /could not start/);
  assert.equal(fixture.calls.ended, 1);
});
test("V21 preview enables only an authenticated, read-only API route after schema acceptance", async () => {
  const fixture = poolFixture({ schemaReady: true });
  const runtime = await createLocalAuthRuntime({
    env: {...ENV, CORNHILL_OFFLINE_DRAFT_ELIGIBILITY: "read-only-v21"},
    poolFactory: fixture.poolFactory,
    passwordHasherFactory: hasherFactory()
  });
  try {
    assert.equal(runtime.offlineDraftEligibilityEnabled, true);
    assert.equal(runtime.financeEnabled, false);
    const request = Readable.from([Buffer.from("{}")]);
    request.url="/api/v1/academics/offline-drafts/eligibility";
    request.method="POST";
    request.headers={
      host:"cornhill.local",origin:"https://cornhill.local",
      "content-type":"application/json"
    };
    request.socket={encrypted:true};
    const response={
      statusCode:null, body:"", headers:{},
      writeHead(status,headers){this.statusCode=status;this.headers=headers;},
      end(body=""){this.body=Buffer.isBuffer(body)?body.toString():String(body);}
    };
    assert.equal(await runtime.authHandler(request,response),true);
    assert.equal(response.statusCode,401);
    assert.doesNotMatch(response.body,/learner|mark|score|secret|database|password/i);
  } finally {
    await runtime.close();
  }
});
