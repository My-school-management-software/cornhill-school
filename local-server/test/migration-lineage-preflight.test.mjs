import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertMigrationManifestCompatible } from "../src/db/migrations.mjs";

const original = "a".repeat(64);
const other = "b".repeat(64);

test("V62 lineage preflight accepts fresh database and matching applied subset", () => {
  const sources = new Map([
    ["095_local_academic_results_and_progression", original],
    ["096_local_individual_nursery_material_receipts", other]
  ]);
  assert.equal(assertMigrationManifestCompatible(sources, []), true);
  assert.equal(assertMigrationManifestCompatible(sources, [
    { migration_name: "095_local_academic_results_and_progression", checksum: original }
  ]), true);
});

test("V62 refuses migration 096 collision: installed provenance versus candidate Nursery receipt table", () => {
  const candidate = new Map([["096_local_individual_nursery_material_receipts", original]]);
  assert.throws(() => assertMigrationManifestCompatible(candidate, [
    { migration_name: "096_local_data_transfer_provenance", checksum: original }
  ]), /Migration version collision/);
});

test("V62 refuses to run older branch against an already newer installed 140-migration database", () => {
  const candidate = new Map([["100_local_finance_account_income_classification", original]]);
  assert.throws(() => assertMigrationManifestCompatible(candidate, [
    { migration_name: "140_local_finance_oversight_read_models", checksum: original }
  ]), /missing from this source branch/);
});

test("V62 refuses changed source of already applied migration even if filename is the same", () => {
  const candidate = new Map([["010_local_finance_payment_posting", original]]);
  assert.throws(() => assertMigrationManifestCompatible(candidate, [
    { migration_name: "010_local_finance_payment_posting", checksum: other }
  ]), /Migration checksum mismatch/);
});

test("V62 rejects malformed ledger identities instead of proceeding to DDL", () => {
  const candidate = new Map([["095_local_academic_results_and_progression", original]]);
  assert.throws(() => assertMigrationManifestCompatible(candidate, [
    { migration_name: "095_local_academic_results_and_progression", checksum: "not-a-sha256" }
  ]), /invalid entries/);
});

test("V62 migration runner performs complete identity preflight before CREATE SCHEMA or SQL changes", async () => {
  const source = await readFile(new URL("../scripts/migrate.mjs", import.meta.url), "utf8");
  const preflightIndex = source.indexOf("assertMigrationManifestCompatible(sourceDigests, applied.rows)");
  const ddlIndex = source.indexOf("CREATE SCHEMA IF NOT EXISTS cornhill_meta");
  assert.ok(preflightIndex >= 0 && ddlIndex > preflightIndex);
  assert.match(source, /to_regclass\('cornhill_meta[.]schema_migrations'\)/);
});
