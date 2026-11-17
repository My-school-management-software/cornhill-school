import test from "node:test";
import assert from "node:assert/strict";
import { readLocalDatabaseConfig } from "../src/db/config.mjs";

const valid = {
  CORNHILL_DB_NAME: "cornhill_local",
  CORNHILL_DB_ADMIN_USER: "cornhill_local_admin",
  CORNHILL_DB_ADMIN_PASSWORD: "a-long-random-development-password-123"
};

test("database config defaults to loopback and the isolated local database", () => {
  const config = readLocalDatabaseConfig(valid);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 5432);
  assert.equal(config.database, "cornhill_local");
  assert.equal(config.ssl, false);
  assert.equal(config.max, 5);
});

test("database config permits IPv6 loopback only when explicitly selected", () => {
  const config = readLocalDatabaseConfig({ ...valid, CORNHILL_DB_HOST: "::1" });
  assert.equal(config.host, "::1");
});

test("database config rejects non-loopback hosts", () => {
  assert.throws(() => readLocalDatabaseConfig({ ...valid, CORNHILL_DB_HOST: "192.168.1.10" }), /loopback-only/);
  assert.throws(() => readLocalDatabaseConfig({ ...valid, CORNHILL_DB_HOST: "db.example.com" }), /loopback-only/);
});

test("database config rejects production or unexpected database names", () => {
  assert.throws(() => readLocalDatabaseConfig({ ...valid, CORNHILL_DB_NAME: "production" }), /cornhill_local/);
  assert.throws(() => readLocalDatabaseConfig({ ...valid, CORNHILL_DB_NAME: "postgres" }), /cornhill_local/);
});

test("database config permits a uniquely named isolated-test database only with explicit identity", () => {
  const isolated = {
    ...valid,
    CORNHILL_DB_TARGET: "isolated-test",
    CORNHILL_DB_NAME: "cornhill_isolated_test_0123456789abcdef0123456789abcdef",
    CORNHILL_DB_PORT: "54329",
    CORNHILL_DB_ISOLATED_SERVER_PORT: "54329",
    CORNHILL_DB_ISOLATED_SYSTEM_IDENTIFIER: "7483921045823049182",
    CORNHILL_DB_ISOLATED_DATA_DIRECTORY: "C:\\temp\\cornhill-pg17-test"
  };
  const config = readLocalDatabaseConfig(isolated);
  assert.equal(config.database, isolated.CORNHILL_DB_NAME);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 54329);
});

test("database config rejects isolated-test mode without an explicit unique identity", () => {
  const isolated = {
    ...valid,
    CORNHILL_DB_TARGET: "isolated-test",
    CORNHILL_DB_NAME: "cornhill_isolated_test_0123456789abcdef0123456789abcdef",
    CORNHILL_DB_PORT: "54329",
    CORNHILL_DB_ISOLATED_SERVER_PORT: "54329",
    CORNHILL_DB_ISOLATED_SYSTEM_IDENTIFIER: "7483921045823049182",
    CORNHILL_DB_ISOLATED_DATA_DIRECTORY: "C:\\temp\\cornhill-pg17-test"
  };
  assert.throws(() => readLocalDatabaseConfig({ ...isolated, CORNHILL_DB_NAME: "cornhill_local" }), /isolated-test database/);
  assert.throws(() => readLocalDatabaseConfig({ ...isolated, CORNHILL_DB_NAME: "cornhill_isolated_test_not-a-uuid" }), /isolated-test database/);
  assert.throws(() => readLocalDatabaseConfig({ ...isolated, CORNHILL_DB_ISOLATED_SYSTEM_IDENTIFIER: "" }), /system identifier/);
  assert.throws(() => readLocalDatabaseConfig({ ...isolated, CORNHILL_DB_ISOLATED_SERVER_PORT: "" }), /server port/);
  assert.throws(() => readLocalDatabaseConfig({ ...isolated, CORNHILL_DB_ISOLATED_DATA_DIRECTORY: "relative/path" }), /absolute path/);
  assert.throws(() => readLocalDatabaseConfig({ ...isolated, CORNHILL_DB_HOST: "localhost" }), /127\.0\.0\.1/);
  assert.throws(() => readLocalDatabaseConfig({ ...isolated, CORNHILL_DB_PORT: "5432" }), /dedicated non-default port/);
});

test("database config rejects invalid ports", () => {
  assert.throws(() => readLocalDatabaseConfig({ ...valid, CORNHILL_DB_PORT: "543" }), /port/);
  assert.throws(() => readLocalDatabaseConfig({ ...valid, CORNHILL_DB_PORT: "70000" }), /port/);
  assert.throws(() => readLocalDatabaseConfig({ ...valid, CORNHILL_DB_PORT: "not-a-number" }), /port/);
});

test("database config requires a valid local username", () => {
  assert.throws(() => readLocalDatabaseConfig({ ...valid, CORNHILL_DB_ADMIN_USER: "" }), /username/);
  assert.throws(() => readLocalDatabaseConfig({ ...valid, CORNHILL_DB_ADMIN_USER: "bad user" }), /username/);
});

test("database config requires a strong local password and never supplies a default", () => {
  assert.throws(() => readLocalDatabaseConfig({ ...valid, CORNHILL_DB_ADMIN_PASSWORD: "short" }), /24 bytes/);
  assert.throws(() => readLocalDatabaseConfig({ ...valid, CORNHILL_DB_ADMIN_PASSWORD: "" }), /24 bytes/);
});

test("database config is immutable and limits pool size", () => {
  const config = readLocalDatabaseConfig(valid);
  assert.equal(Object.isFrozen(config), true);
  assert.equal(config.max, 5);
  assert.equal(config.connectionTimeoutMillis, 5000);
});

test("database config accepts localhost as a loopback alias", () => {
  assert.equal(readLocalDatabaseConfig({ ...valid, CORNHILL_DB_HOST: "localhost" }).host, "localhost");
});

test("database config accepts the permitted port boundaries", () => {
  assert.equal(readLocalDatabaseConfig({ ...valid, CORNHILL_DB_PORT: "1024" }).port, 1024);
  assert.equal(readLocalDatabaseConfig({ ...valid, CORNHILL_DB_PORT: "65535" }).port, 65535);
});

test("database config rejects usernames longer than the database identifier limit", () => {
  assert.throws(() => readLocalDatabaseConfig({ ...valid, CORNHILL_DB_ADMIN_USER: "u".repeat(64) }), /username/);
});

test("database password minimum is measured in UTF-8 bytes", () => {
  assert.throws(() => readLocalDatabaseConfig({ ...valid, CORNHILL_DB_ADMIN_PASSWORD: "é".repeat(11) }), /24 bytes/);
  assert.equal(readLocalDatabaseConfig({ ...valid, CORNHILL_DB_ADMIN_PASSWORD: "é".repeat(12) }).password, "é".repeat(12));
});

test("database config refuses published placeholder password", () => {
  assert.throws(() => readLocalDatabaseConfig({
    ...valid, CORNHILL_DB_ADMIN_PASSWORD: "REPLACE_WITH_A_LONG_RANDOM_PASSWORD"
  }), /24 bytes/);
});
