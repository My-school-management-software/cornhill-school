import test from "node:test";
import assert from "node:assert/strict";
import { readLocalRuntimeDatabaseConfig } from "../src/db/runtime-config.mjs";

const base={
  CORNHILL_DB_HOST:"127.0.0.1",CORNHILL_DB_PORT:"54329",
  CORNHILL_DB_NAME:"cornhill_local",CORNHILL_DB_RUNTIME_USER:"cornhill_auth_api",
  CORNHILL_DB_RUNTIME_PASSWORD:"a".repeat(40)
};
test("runtime config accepts the dedicated auth role on loopback",()=>{
  const c=readLocalRuntimeDatabaseConfig(base);
  assert.equal(c.host,"127.0.0.1");assert.equal(c.database,"cornhill_local");
  assert.equal(c.user,"cornhill_auth_api");assert.equal(c.port,54329);
  assert.equal(c.ssl,false);assert.equal(Object.isFrozen(c),true);
});
test("runtime config supports native local PostgreSQL 5432",()=>{
  const c=readLocalRuntimeDatabaseConfig({...base,CORNHILL_DB_PORT:"5432"});
  assert.equal(c.port,5432);
});
test("runtime config rejects LAN database hosts",()=>{
  assert.throws(()=>readLocalRuntimeDatabaseConfig({...base,CORNHILL_DB_HOST:"192.168.1.20"}),/loopback-only/);
});
test("runtime config rejects invalid or non-approved ports",()=>{
  for(const port of ["0","5433","65536","abc"]) assert.throws(()=>readLocalRuntimeDatabaseConfig({...base,CORNHILL_DB_PORT:port}),/port/);
});
test("runtime config rejects another database or administrator role",()=>{
  assert.throws(()=>readLocalRuntimeDatabaseConfig({...base,CORNHILL_DB_NAME:"postgres"}),/cornhill_local/);
  assert.throws(()=>readLocalRuntimeDatabaseConfig({...base,CORNHILL_DB_RUNTIME_USER:"cornhill_local_admin"}),/dedicated cornhill_auth_api/);
});
test("runtime config requires a long private UTF-8 password",()=>{
  assert.throws(()=>readLocalRuntimeDatabaseConfig({...base,CORNHILL_DB_RUNTIME_PASSWORD:"short"}),/32 UTF-8 bytes/);
  assert.throws(()=>readLocalRuntimeDatabaseConfig({...base,CORNHILL_DB_RUNTIME_PASSWORD:"é".repeat(15)}),/32 UTF-8 bytes/);
  assert.throws(()=>readLocalRuntimeDatabaseConfig({...base,CORNHILL_DB_RUNTIME_PASSWORD:"REPLACE_WITH_A_LONG_RANDOM_RUNTIME_PASSWORD"}),/32 UTF-8 bytes/);
  assert.throws(()=>readLocalRuntimeDatabaseConfig({...base,CORNHILL_DB_RUNTIME_USER:"",CORNHILL_DB_RUNTIME_PASSWORD:""}),/dedicated cornhill_auth_api/);
});
