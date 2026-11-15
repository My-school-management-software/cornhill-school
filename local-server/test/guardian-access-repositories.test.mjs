import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresGuardianAccessRepository } from "../src/db/guardian-access-repositories.mjs";

const CONTACT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const STAFF = "11111111-2222-4333-8444-555555555555";
const ACCOUNT = "99999999-8888-4777-8666-555555555555";

test("guardian directory returns masked phone information and current access status", async () => {
  let sql = "";
  const repository = createPostgresGuardianAccessRepository({
    async query(statement) {
      sql = statement;
      return { rows: [{ contactId: CONTACT, phoneLastFour: "0001", accessStatus: "approved" }] };
    },
    async connect() { throw new Error("not used"); }
  });
  const rows = await repository.listContacts();
  assert.equal(rows[0].phoneLastFour, "0001");
  assert.match(sql, /right\(gc\.phone_e164, 4\)/);
  assert.match(sql, /gc\.is_active = true/);
  assert.match(sql, /l\.status <> 'Archived'/);
  assert.doesNotMatch(sql, /SELECT\s+gc\.phone_e164/i);
});

test("new guardian account, learner approval and audit event commit atomically", async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM cornhill_school\.guardian_contacts/.test(sql)) {
        return { rows: [{ learnerId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", guardianName: "Guardian", phone: "+256700000001", phoneLastFour: "0001", pupilCode: "CH-2026-000001", learnerName: "Learner" }] };
      }
      if (/FROM cornhill_auth\.guardian_accounts WHERE/.test(sql)) return { rows: [] };
      if (/INSERT INTO cornhill_auth\.guardian_accounts/.test(sql)) return { rows: [{ id: ACCOUNT, account_status: "active" }] };
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ released: true }); }
  };
  const repository = createPostgresGuardianAccessRepository({ async query() { return { rows: [] }; }, async connect() { return client; } });
  const result = await repository.issuePin({ contactId: CONTACT, actorStaffId: STAFF, pinHash: "$argon2id$hash" });
  assert.equal(result.learner.pupilCode, "CH-2026-000001");
  assert.equal(result.guardian.phoneLastFour, "0001");
  assert.equal(calls.at(-2).sql, "COMMIT");
  assert.equal(calls.some(x => typeof x.sql === "string" && /guardian_learner_access/.test(x.sql)), true);
  assert.equal(calls.some(x => typeof x.sql === "string" && /security_audit_events/.test(x.sql)), true);
  assert.equal(calls.some(x => x.params?.includes("+256700000001") && /UPDATE cornhill_auth.guardian_accounts/.test(x.sql || "")), false);
  const accountInsert = calls.find(x => /INSERT INTO cornhill_auth\.guardian_accounts/.test(x.sql || ""));
  assert.equal(accountInsert.params[1], "+256700000001");
  assert.equal(accountInsert.params[2], "$argon2id$hash");
});

test("active existing guardian account can approve a sibling learner without changing its PIN", async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM cornhill_school\.guardian_contacts/.test(sql)) return { rows: [{ learnerId: CONTACT, guardianName: "Guardian", phone: "+256700000001", phoneLastFour: "0001", pupilCode: "CH-2026-000001", learnerName: "Learner" }] };
      if (/FROM cornhill_auth\.guardian_accounts WHERE/.test(sql)) return { rows: [{ id: ACCOUNT, account_status: "active" }] };
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ released: true }); }
  };
  const repository = createPostgresGuardianAccessRepository({ query: async()=>({rows:[]}), connect: async()=>client });
  const result = await repository.issuePin({ contactId: CONTACT, actorStaffId: STAFF, pinHash: "$argon2id$unused" });
  assert.equal(result.pinIssued, false);
  assert.equal(result.replacedExistingPin, false);
  assert.equal(calls.some(item => /UPDATE cornhill_auth\.guardian_accounts/.test(item.sql || "")), false);
  assert.equal(calls.some(item => /INSERT INTO cornhill_auth\.guardian_learner_access/.test(item.sql || "")), true);
  assert.equal(calls.some(item => /security_audit_events/.test(item.sql || "")), true);
  assert.equal(calls.some(item => item.sql === "COMMIT"), true);
});

test("replacing an active guardian PIN requires confirmation and records the reissue", async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM cornhill_school\.guardian_contacts/.test(sql)) return { rows: [{ learnerId: CONTACT, guardianName: "Guardian", phone: "+256700000001", phoneLastFour: "0001", pupilCode: "CH-2026-000001", learnerName: "Learner" }] };
      if (/FROM cornhill_auth\.guardian_accounts WHERE/.test(sql)) return { rows: [{ id: ACCOUNT, account_status: "active" }] };
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ released: true }); }
  };
  const repository = createPostgresGuardianAccessRepository({ query: async()=>({rows:[]}), connect: async()=>client });
  const result = await repository.issuePin({ contactId: CONTACT, actorStaffId: STAFF, pinHash: "$argon2id$new-hash", replaceExisting: true });
  assert.equal(result.pinIssued, true);
  assert.equal(result.replacedExistingPin, true);
  const update = calls.find(item => /UPDATE cornhill_auth\.guardian_accounts/.test(item.sql || ""));
  assert.deepEqual(update.params, [ACCOUNT, "$argon2id$new-hash"]);
  assert.equal(calls.some(item => item.sql === "COMMIT"), true);
});

test("disabled guardian accounts are not silently reactivated", async () => {
  const client = {
    async query(sql) {
      if (/FROM cornhill_school\.guardian_contacts/.test(sql)) return { rows: [{ learnerId: CONTACT, guardianName: "Guardian", phone: "+256700000001", phoneLastFour: "0001", pupilCode: "CH-2026-000001", learnerName: "Learner" }] };
      if (/FROM cornhill_auth\.guardian_accounts WHERE/.test(sql)) return { rows: [{ id: ACCOUNT, account_status: "disabled" }] };
      return { rows: [] };
    },
    release() {}
  };
  const repository = createPostgresGuardianAccessRepository({ query: async()=>({rows:[]}), connect: async()=>client });
  await assert.rejects(repository.issuePin({ contactId: CONTACT, actorStaffId: STAFF, pinHash: "$argon2id$hash", replaceExisting: true }), error => error.code === "CORNHILL_GUARDIAN_CONFLICT");
});

test("missing contact and invalid identifiers fail closed", async () => {
  const pool = { query: async()=>({rows:[]}), connect: async()=>({ query: async()=>({rows:[]}), release(){} }) };
  const repository = createPostgresGuardianAccessRepository(pool);
  await assert.rejects(repository.issuePin({ contactId: "bad", actorStaffId: STAFF, pinHash: "$argon2id$hash" }), /UUID/);
  await assert.rejects(repository.issuePin({ contactId: CONTACT, actorStaffId: STAFF, pinHash: "plaintext" }), /Argon2id/);
  await assert.rejects(repository.issuePin({ contactId: CONTACT, actorStaffId: STAFF, pinHash: "$argon2id$hash" }), error => error.code === "CORNHILL_GUARDIAN_NOT_FOUND");
});
