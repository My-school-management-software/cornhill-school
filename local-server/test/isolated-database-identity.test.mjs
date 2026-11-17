import test from "node:test";
import assert from "node:assert/strict";
import { assertIsolatedDatabaseIdentity, assertIsolatedPostgresServerIdentity } from "../src/db/migrations.mjs";

const isolatedDataDirectory = process.platform === "win32"
  ? "C:\\temp\\cornhill-pg17-test"
  : "/tmp/cornhill-pg17-test";

const expected = {
  database: "cornhill_isolated_test_0123456789abcdef0123456789abcdef",
  serverPort: 54329,
  systemIdentifier: "7483921045823049182",
  dataDirectory: isolatedDataDirectory
};

const actual = {
  database: expected.database,
  server_address: "127.0.0.1",
  port: String(expected.serverPort),
  system_identifier: expected.systemIdentifier,
  data_directory: process.platform === "win32"
    ? "c:/temp/cornhill-pg17-test/"
    : isolatedDataDirectory,
  user_object_count: 0
};

test("isolated migration preflight accepts the exact empty scratch database", () => {
  assert.equal(assertIsolatedDatabaseIdentity(actual, expected), true);
});

test("isolated migration preflight rejects another database name", () => {
  assert.throws(() => assertIsolatedDatabaseIdentity({ ...actual, database: "cornhill_local" }, expected), /preflight failed/);
});

test("isolated migration preflight accepts a private Docker bridge IPv4 server address", () => {
  assert.equal(assertIsolatedPostgresServerIdentity({ ...actual, server_address: "172.19.0.4" }, expected), true);
});

test("isolated migration preflight accepts a private IPv6 server address", () => {
  assert.equal(assertIsolatedPostgresServerIdentity({ ...actual, server_address: "fd12:3456:789a::4" }, expected), true);
});

test("isolated migration preflight rejects public and malformed server addresses", () => {
  for (const server_address of ["8.8.8.8", "172.32.0.1", "2001:4860:4860::8888", "not-an-ip"]) {
    assert.throws(() => assertIsolatedPostgresServerIdentity({ ...actual, server_address }, expected), /preflight failed/);
  }
});

test("isolated migration preflight rejects a different server port", () => {
  assert.throws(() => assertIsolatedDatabaseIdentity({ ...actual, port: "5432" }, expected), /preflight failed/);
});

test("isolated migration preflight rejects a different cluster or data directory", () => {
  assert.throws(() => assertIsolatedDatabaseIdentity({ ...actual, system_identifier: "1" }, expected), /preflight failed/);
  assert.throws(() => assertIsolatedDatabaseIdentity({ ...actual, data_directory: process.platform === "win32" ? "C:\\postgres\\data" : "/var/lib/postgresql/data" }, expected), /preflight failed/);
});

test("isolated migration preflight rejects any pre-existing user tables", () => {
  assert.throws(() => assertIsolatedDatabaseIdentity({ ...actual, user_object_count: 1 }, expected), /not empty/);
});

test("isolated server identity remains verifiable after migrations create tables", () => {
  assert.equal(assertIsolatedPostgresServerIdentity({ ...actual, user_object_count: 64 }, expected), true);
});
