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
  assert.equal(config.port, 54329);
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
