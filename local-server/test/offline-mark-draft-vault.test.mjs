import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openOfflineMarkDraftVault } from "../src/sync/offline-mark-draft-vault.mjs";

const example = () => ({
  operationId: randomUUID(), scope: "assessment_score",
  learnerSourceId: randomUUID(), assessmentSourceId: randomUUID(),
  subjectSourceId: randomUUID(), actorStaffId: randomUUID(),
  score: 78, baselineRevision: 1,
  baselineFingerprint: "a".repeat(64)
});
async function runWithVault(fn) {
  const directory = await mkdtemp(join(tmpdir(), "cornhill-v21-vault-test-"));
  const key = randomBytes(32);
  try { return await fn({ directory, key }); }
  finally { await rm(directory, { recursive: true, force: true }); key.fill(0); }
}

test("stores a real encrypted pending mark draft, not school data in plaintext", async () => {
  await runWithVault(async ({ directory, key }) => {
    const vault = await openOfflineMarkDraftVault({ directory, key });
    const draft = example();
    const result = await vault.enqueueDraft(draft);
    assert.equal(result.status, "queued_locally");
    assert.equal(result.uploaded, false);
    const raw = (await readFile(join(directory, draft.operationId + ".draft"))).toString("utf8");
    assert.doesNotMatch(raw, new RegExp(draft.learnerSourceId));
    assert.doesNotMatch(raw, new RegExp(draft.assessmentSourceId));
    assert.doesNotMatch(raw, /baselineFingerprint|learnerSourceId|actorStaffId|score/i);
    assert.deepEqual(await vault.readDraft(draft.operationId), draft);
    assert.equal((await vault.countPending()).pending, 1);
  });
});

test("survives reopening the vault after process-like restart", async () => {
  await runWithVault(async ({ directory, key }) => {
    const draft = example();
    await (await openOfflineMarkDraftVault({ directory, key })).enqueueDraft(draft);
    const reopened = await openOfflineMarkDraftVault({ directory, key });
    assert.deepEqual(await reopened.readDraft(draft.operationId), draft);
  });
});

test("same operation ID and content is idempotent, never double-queued", async () => {
  await runWithVault(async ({ directory, key }) => {
    const vault = await openOfflineMarkDraftVault({ directory, key });
    const draft = example();
    assert.equal((await vault.enqueueDraft(draft)).status, "queued_locally");
    assert.equal((await vault.enqueueDraft(draft)).status, "already_queued");
    assert.equal((await vault.countPending()).pending, 1);
  });
});

test("reusing operation ID with different marks fails closed and preserves original", async () => {
  await runWithVault(async ({ directory, key }) => {
    const vault = await openOfflineMarkDraftVault({ directory, key });
    const draft = example();
    await vault.enqueueDraft(draft);
    await assert.rejects(vault.enqueueDraft({ ...draft, score: 99 }), /Idempotency conflict/);
    assert.deepEqual(await vault.readDraft(draft.operationId), draft);
  });
});

test("rejects missing encryption key and never stores key alongside data", async () => {
  await runWithVault(async ({ directory }) => {
    await assert.rejects(openOfflineMarkDraftVault({ directory }), /32-byte AES key/);
    await assert.rejects(openOfflineMarkDraftVault({ directory, key: "not-secret" }), /32-byte AES key/);
    assert.deepEqual(await readdir(directory), []);
  });
});

test("rejects tampering with authenticated ciphertext", async () => {
  await runWithVault(async ({ directory, key }) => {
    const vault = await openOfflineMarkDraftVault({ directory, key });
    const draft = example(); await vault.enqueueDraft(draft);
    const file = join(directory, draft.operationId + ".draft");
    const data = JSON.parse(await readFile(file, "utf8"));
    data.ciphertext = (data.ciphertext[0] === "A" ? "B" : "A") + data.ciphertext.slice(1);
    await writeFile(file, JSON.stringify(data));
    await assert.rejects(vault.readDraft(draft.operationId));
  });
});

test("different key cannot decrypt the draft", async () => {
  await runWithVault(async ({ directory, key }) => {
    const draft = example();
    await (await openOfflineMarkDraftVault({ directory, key })).enqueueDraft(draft);
    const other = await openOfflineMarkDraftVault({ directory, key: randomBytes(32) });
    await assert.rejects(other.readDraft(draft.operationId));
  });
});

test("rejects payment, guardian, payroll and other record scopes", async () => {
  await runWithVault(async ({ directory, key }) => {
    const vault = await openOfflineMarkDraftVault({ directory, key });
    for (const scope of ["payment", "finance", "guardian", "payroll", "learner_profile", "attendance"]) {
      await assert.rejects(vault.enqueueDraft({ ...example(), scope }), /Only assessment_score/);
    }
    assert.equal((await vault.countPending()).pending, 0);
  });
});

test("rejects extra fields that might leak contact or financial information", async () => {
  await runWithVault(async ({ directory, key }) => {
    const vault = await openOfflineMarkDraftVault({ directory, key });
    for (const field of ["guardianPhone", "receiptNo", "paymentAmount", "password"]) {
      await assert.rejects(vault.enqueueDraft({ ...example(), [field]: "danger" }), /unsupported fields/);
    }
    assert.equal((await vault.countPending()).pending, 0);
  });
});

test("rejects missing or malformed identity or baseline", async () => {
  await runWithVault(async ({ directory, key }) => {
    const vault = await openOfflineMarkDraftVault({ directory, key });
    for (const invalid of [
      { operationId: "../x" }, { learnerSourceId: "a" }, { actorStaffId: 0 },
      { baselineRevision: 0 }, { baselineFingerprint: "wrong" },
      { score: -1 }, { score: 101 }, { score: NaN }, { score: "90" }
    ]) {
      await assert.rejects(vault.enqueueDraft({ ...example(), ...invalid }));
    }
    assert.equal((await vault.countPending()).pending, 0);
  });
});

test("does not permit a vault inside the source repository", async () => {
  await assert.rejects(openOfflineMarkDraftVault({
    directory: fileURLToPath(new URL("../", import.meta.url)),
    key: randomBytes(32)
  }), /outside the code repository/);
});

test("requires an absolute directory", async () => {
  await assert.rejects(openOfflineMarkDraftVault({ directory: "./drafts", key: randomBytes(32) }), /absolute/);
});

test("refuses a symlinked vault directory", async t => {
  if (process.platform === "win32") { t.skip("Windows symlink creation requires privileges"); return; }
  await runWithVault(async ({ directory, key }) => {
    const alias = directory + "-link";
    await symlink(directory, alias, "dir");
    try { await assert.rejects(openOfflineMarkDraftVault({ directory: alias, key }), /approved private directory/); }
    finally { await rm(alias, { force: true }); }
  });
});

test("pending-count output never contains learner, mark or actor information", async () => {
  await runWithVault(async ({ directory, key }) => {
    const vault = await openOfflineMarkDraftVault({ directory, key });
    const a = example(), b = example();
    await vault.enqueueDraft(a); await vault.enqueueDraft(b);
    const result = await vault.countPending();
    assert.deepEqual(result, { pending: 2, uploaded: false, financeSyncEnabled: false });
    assert.doesNotMatch(JSON.stringify(result), new RegExp(a.learnerSourceId));
  });
});

test("readDraft refuses file traversal and non-UUID identifiers", async () => {
  await runWithVault(async ({ directory, key }) => {
    const vault = await openOfflineMarkDraftVault({ directory, key });
    for (const id of ["../danger", "", "a".repeat(32), randomUUID().toUpperCase()]) {
      await assert.rejects(vault.readDraft(id), /canonical UUID/);
    }
  });
});

test("does not provide upload, flush, delete, send or mark-posted operations", async () => {
  await runWithVault(async ({ directory, key }) => {
    const vault = await openOfflineMarkDraftVault({ directory, key });
    assert.deepEqual(Object.keys(vault).sort(), ["countPending", "enqueueDraft", "readDraft"]);
    assert.ok(Object.isFrozen(vault));
  });
});

test("vault creates no automatic financial records or network transmissions", async () => {
  await runWithVault(async ({ directory, key }) => {
    const vault = await openOfflineMarkDraftVault({ directory, key });
    const draft = example();
    await vault.enqueueDraft(draft);
    const files = await readdir(directory);
    assert.deepEqual(files, [draft.operationId + ".draft"]);
  });
});
