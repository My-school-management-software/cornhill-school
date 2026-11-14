import test from "node:test";
import assert from "node:assert/strict";
import { readLocalFinanceRuntimeDatabaseConfig } from "../src/db/finance-runtime-config.mjs";

const base={
  CORNHILL_DB_HOST:"127.0.0.1",CORNHILL_DB_PORT:"5432",
  CORNHILL_DB_NAME:"cornhill_local",
  CORNHILL_DB_FINANCE_RUNTIME_PASSWORD:"f".repeat(40)
};
test("finance runtime remains disabled until a non-placeholder private secret is configured",()=>{
  assert.equal(readLocalFinanceRuntimeDatabaseConfig({}),null);
  assert.equal(readLocalFinanceRuntimeDatabaseConfig({...base,CORNHILL_DB_FINANCE_RUNTIME_PASSWORD:"REPLACE_WITH_FINANCE_RUNTIME_PASSWORD"}),null);
});
test("finance runtime uses the dedicated finance API role on local PostgreSQL",()=>{
  const config=readLocalFinanceRuntimeDatabaseConfig(base);
  assert.equal(config.user,"cornhill_finance_api");
  assert.equal(config.port,5432);
  assert.equal(config.database,"cornhill_local");
  assert.equal(config.host,"127.0.0.1");
  assert.equal(config.password,base.CORNHILL_DB_FINANCE_RUNTIME_PASSWORD);
  assert.equal(config.ssl,false);
  assert.equal(Object.isFrozen(config),true);
});
test("finance runtime accepts the isolated CI port",()=>{
  assert.equal(readLocalFinanceRuntimeDatabaseConfig({...base,CORNHILL_DB_PORT:"54329"}).port,54329);
});
test("finance runtime rejects non-loopback, unknown port and wrong database",()=>{
  assert.throws(()=>readLocalFinanceRuntimeDatabaseConfig({...base,CORNHILL_DB_HOST:"10.0.0.5"}),/loopback-only/);
  assert.throws(()=>readLocalFinanceRuntimeDatabaseConfig({...base,CORNHILL_DB_PORT:"5433"}),/port/);
  assert.throws(()=>readLocalFinanceRuntimeDatabaseConfig({...base,CORNHILL_DB_NAME:"postgres"}),/cornhill_local/);
});
test("finance runtime refuses short credentials",()=>{
  assert.throws(()=>readLocalFinanceRuntimeDatabaseConfig({...base,CORNHILL_DB_FINANCE_RUNTIME_PASSWORD:"short"}),/32 UTF-8 bytes/);
});
