import test from "node:test";
import assert from "node:assert/strict";
import { readLocalRuntimeDatabaseConfig } from "../src/db/runtime-config.mjs";

const base = {
  CORNHILL_DB_HOST: "127.0.0.1",
  CORNHILL_DB_PORT: "54329",
  CORNHILL_DB_NAME: "cornhill_local",
  CORNHILL_DB_RUNTIME_USER: "cornhill_auth_api",
  CORNHILL_DB_RUNTIME_PASSWORD: "a".repeat(40)
};

test("runtime config accepts the dedicated auth role on loopback", () => {
  const config = readLocalRuntimeDatabaseConfig(base);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.database, "cornhill_local");
  assert.equal(config.user, "cornhill_auth_api");
  assert.equal(config.ssl, false);
  assert.equal(Object.isFrozen(config), true);
});
test("runtime config rejects LAN database hosts", () => {
  assert.throws(() => readLocalRuntimeDatabaseConfig({
    ...base, CORNHILL_DB_HOST: "192.168.1.20"
  }), /loopback-only/);
});
test("runtime config rejects invalid ports", () => {
  for (const port of ["0", "5432", "65536", "abc"]) {
    assert.throws(() => readLocalRuntimeDatabaseConfig({
      ...base, CORNHILL_DB_PORT: port
    }), /port/);
  }
});
test("runtime config rejects another database", () => {
  assert.throws(() => readLocalRuntimeDatabaseConfig({
    ...base, CORNHILL_DB_NAME: "postgres"
  }), /cornhill_local/);
});
test("runtime config refuses the database administrator account", () => {
  assert.throws(() => readLocalRuntimeDatabaseConfig({
    ...base, CORNHILL_DB_RUNTIME_USER: "cornhill_local_admin"
  }), /dedicated cornhill_auth_api/);
});
test("runtime config requires a long private password", () => {
  assert.throws(() => readLocalRuntimeDatabaseConfig({
    ...base, CORNHILL_DB_RUNTIME_PASSWORD: "short"
  }), /32 UTF-8 bytes/);
});
test("runtime config validates UTF-8 password byte length", () => {
  assert.throws(() => readLocalRuntimeDatabaseConfig({
    ...base, CORNHILL_DB_RUNTIME_PASSWORD: "é".repeat(15)
  }), /32 UTF-8 bytes/);
});
test("runtime config refuses absent runtime credentials", () => {
  assert.throws(() => readLocalRuntimeDatabaseConfig({
    ...base, CORNHILL_DB_RUNTIME_USER: "", CORNHILL_DB_RUNTIME_PASSWORD: ""
  }), /dedicated cornhill_auth_api/);
});
