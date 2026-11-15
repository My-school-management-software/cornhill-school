import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresSchoolCatalogRepository } from "../src/db/school-catalog-repositories.mjs";

test("school catalogue repository returns active class metadata and mapped subjects", async () => {
  const calls = [];
  const pool = {
    async query(sql) {
      calls.push(sql);
      return { rows: [{
        id: "11111111-1111-4111-8111-111111111111",
        classCode: "P1",
        displayName: "P.1",
        section: "Primary",
        levelOrder: 4,
        stream: "",
        subjects: [{ subjectCode: "ENGLISH", subjectName: "English", displayOrder: 1 }]
      }] };
    }
  };
  const result = await createPostgresSchoolCatalogRepository(pool).listActiveClassesAndSubjects();
  assert.equal(result.length, 1);
  assert.equal(result[0].classCode, "P1");
  assert.equal(result[0].subjects[0].subjectCode, "ENGLISH");
  assert.match(calls[0], /WHERE c\.is_active = true/);
  assert.match(calls[0], /cs\.is_active = true/);
  assert.match(calls[0], /s\.is_active = true/);
  assert.doesNotMatch(calls[0], /learners|guardian|finance|marks/i);
});

test("school catalogue repository normalises missing subject arrays", async () => {
  const pool = { async query() { return { rows: [{ id: "id", subjects: null }] }; } };
  const [row] = await createPostgresSchoolCatalogRepository(pool).listActiveClassesAndSubjects();
  assert.deepEqual(row.subjects, []);
});

test("school catalogue repository rejects an invalid pool", () => {
  assert.throws(() => createPostgresSchoolCatalogRepository({}), /PostgreSQL query pool/);
});
