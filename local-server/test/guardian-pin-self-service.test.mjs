import test from "node:test";
import assert from "node:assert/strict";
import { createGuardianPinChangeHttpHandler } from "../src/security/guardian-pin-change-http-handler.mjs";
import { createPostgresGuardianPinChangeRepository } from "../src/db/guardian-pin-change-repository.mjs";
import { readFile } from "node:fs/promises";

const ORIGIN = "https://localhost:4174";
const GUARDIAN = "11111111-2222-4333-8444-555555555555";
const SESSION = "S".repeat(43);
const CSRF = "C".repeat(43);
function response() {
  return {
    status: 0, body: "",
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body = "") { this.body = String(body); }
  };
}
function request({ path = "/api/v1/guardian/pin/change", method = "POST",
  origin = ORIGIN, host = "localhost:4174", encrypted = true,
  body = { currentPin: "18374629", newPin: "29583746", confirmNewPin: "29583746" } } = {}) {
  const req = {
    url: path, method, socket: { encrypted },
    headers: {
      host, origin,
      "content-type": "application/json",
      cookie: "__Host-cornhill_session=" + SESSION + "; __Host-cornhill_csrf=" + CSRF,
      "x-cornhill-csrf": CSRF
    }
  };
  req[Symbol.asyncIterator] = async function* () { yield Buffer.from(JSON.stringify(body)); };
  return req;
}
function create({ principalType = "guardian", fail = null } = {}) {
  const calls = { auth: [], changes: [] };
  const authService = {
    async authenticate(input) {
      calls.auth.push(input);
      if (fail === "auth") throw new Error("fake private auth error");
      return { id: GUARDIAN, principalType, accountStatus: "active" };
    }
  };
  const repository = {
    async changeGuardianPin(input) {
      calls.changes.push(input);
      if (fail === "current") {
        const error = new Error("Wrong");
        error.code = "CORNHILL_CURRENT_PIN_INVALID";
        throw error;
      }
      if (fail === "database") throw new Error("PRIVATE DATABASE SECRET");
      return true;
    }
  };
  return { calls, handle: createGuardianPinChangeHttpHandler({ authService, repository, expectedOrigin: ORIGIN }) };
}
async function send(fixture, opts) {
  const res = response(); await fixture.handle(request(opts), res);
  return res;
}
test("guardian may change PIN after current-PIN verification, without revealing old or new PIN in reply", async () => {
  const f = create();
  const res = await send(f);
  assert.equal(res.status, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  const data = JSON.parse(res.body);
  assert.equal(data.changed, true);
  assert.equal(data.requiresSignIn, true);
  assert.equal(f.calls.changes.length, 1);
  assert.equal(f.calls.changes[0].guardianAccountId, GUARDIAN);
  assert.equal(f.calls.auth[0].method, "POST");
  assert.equal(f.calls.auth[0].csrfToken, CSRF);
  assert.doesNotMatch(res.body, /18374629|29583746|pinHash/);
});
test("non-guardian principal is denied, even with staff Director permissions", async () => {
  const f = create({ principalType: "staff" });
  assert.equal((await send(f)).status, 403);
  assert.equal(f.calls.changes.length, 0);
});
test("PIN change requires encrypted same-origin request", async () => {
  const f = create();
  assert.equal((await send(f, { encrypted: false })).status, 426);
  assert.equal((await send(f, { origin: "https://evil.example" })).status, 403);
  assert.equal((await send(f, { host: "evil.example" })).status, 403);
  assert.equal(f.calls.changes.length, 0);
});
test("rejects PIN reuse, mismatch, simple PIN and non-eight-digit PIN", async () => {
  const f = create();
  for (const bad of [
    { currentPin: "18374629", newPin: "18374629", confirmNewPin: "18374629" },
    { currentPin: "18374629", newPin: "98765432", confirmNewPin: "98765432" },
    { currentPin: "18374629", newPin: "55555555", confirmNewPin: "55555555" },
    { currentPin: "18374629", newPin: "29583746", confirmNewPin: "11111111" },
    { currentPin: "123", newPin: "29583746", confirmNewPin: "29583746" }
  ]) assert.equal((await send(f, { body: bad })).status, 400);
  assert.equal(f.calls.changes.length, 0);
});
test("incorrect current PIN gets a generic response without exposing hash or new PIN", async () => {
  const res = await send(create({ fail: "current" }));
  assert.equal(res.status, 401);
  assert.doesNotMatch(res.body, /29583746|18374629|hash/);
});
test("database errors are masked", async () => {
  const res = await send(create({ fail: "database" }));
  assert.equal(res.status, 503);
  assert.doesNotMatch(res.body, /PRIVATE DATABASE SECRET/);
});
test("guardian PIN change is rate-limited and never calls database after five attempts", async () => {
  const f = create({ fail: "current" });
  for (let i = 0; i < 5; i++) assert.equal((await send(f)).status, 401);
  assert.equal((await send(f)).status, 429);
  assert.equal(f.calls.changes.length, 5);
});
test("repository verifies old PIN under row lock, hashes new PIN, revokes ALL guardian sessions and audits", async () => {
  const queries = [];
  const client = {
    async query(sql, args = []) {
      queries.push([String(sql), args]);
      if (String(sql).includes("FROM cornhill_auth.guardian_accounts")) {
        return { rows: [{ id: GUARDIAN, pinHash: "$argon2id$stored", accountStatus: "active" }], rowCount: 1 };
      }
      if (String(sql).includes("RETURNING id")) return { rows: [{ id: GUARDIAN }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const pool = { async connect() { return client; } };
  const passwordHasher = {
    async verify(stored, entered) { return stored === "$argon2id$stored" && entered === "18374629"; },
    async hash(value) { assert.equal(value, "29583746"); return "$argon2id$replacement"; },
    isArgon2idHash(value) { return value?.startsWith("$argon2id$"); }
  };
  const repo = createPostgresGuardianPinChangeRepository(pool, passwordHasher);
  assert.equal(await repo.changeGuardianPin({
    guardianAccountId: GUARDIAN, currentPin: "18374629", newPin: "29583746"
  }), true);
  const logs = queries.map(([sql]) => sql).join("\n");
  assert.match(logs, /FOR UPDATE/);
  assert.match(logs, /pin_changed_at=now\(\)/);
  assert.match(logs, /UPDATE cornhill_auth[.]auth_sessions SET revoked_at=now\(\)/);
  assert.match(logs, /guardian[.]pin_changed_by_guardian/);
  assert.equal(queries.at(-1)[0], "COMMIT");
  assert.equal(queries.some(([sql, params]) => /INSERT INTO cornhill_auth[.]security_audit_events/.test(sql) && params.includes("29583746")), false);
});
test("repository rolls back on wrong current PIN without changing credential", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(String(sql));
      if (String(sql).includes("FROM cornhill_auth.guardian_accounts")) {
        return { rows: [{ id: GUARDIAN, pinHash: "$argon2id$stored", accountStatus: "active" }] };
      }
      return { rows: [] };
    },
    release() {}
  };
  const repo = createPostgresGuardianPinChangeRepository({ async connect() { return client; } }, {
    async verify() { return false; },
    async hash() { throw new Error("Should never hash"); },
    isArgon2idHash(value) { return value.startsWith("$argon2id$"); }
  });
  await assert.rejects(repo.changeGuardianPin({
    guardianAccountId: GUARDIAN, currentPin: "18374629", newPin: "29583746"
  }), e => e.code === "CORNHILL_CURRENT_PIN_INVALID");
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.equal(queries.some(sql => sql.startsWith("UPDATE")), false);
});
test("guardian settings and API wiring exist, but the Director never receives the new PIN", async () => {
  const html = await readFile(new URL("../public/guardian.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/guardian.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/security/auth-runtime.mjs", import.meta.url), "utf8");
  assert.match(html, /id="guardian-change-pin-form"/);
  assert.match(js, /\/guardian\/pin\/change/);
  assert.match(js, /form[.]reset\(\)/);
  assert.match(runtime, /if \(await guardianPinChangeHandler\(request, response\)\) return true/);
});
