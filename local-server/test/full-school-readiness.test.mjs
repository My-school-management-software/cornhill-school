import test from "node:test";
import assert from "node:assert/strict";
import { getFullSchoolReadiness } from "../src/full-school-readiness.mjs";

test("full school remains disabled while integration blockers exist", () => {
  const result = getFullSchoolReadiness();
  assert.equal(result.enabled, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.stage, "local-integration");
  assert.ok(result.blockers.length >= 5);
});

test("readiness reports the actual integration work still outstanding", () => {
  const codes = getFullSchoolReadiness().blockers.map(item => item.code);
  for (const expected of ["frontend_not_integrated", "school_api_parity_incomplete", "hosted_dependencies_pending", "offline_sync_not_accepted", "multi_device_acceptance_pending"]) {
    assert.ok(codes.includes(expected), "Missing blocker: " + expected);
  }
});

test("readiness response does not expose credentials or local paths", () => {
  const serialized = JSON.stringify(getFullSchoolReadiness());
  assert.doesNotMatch(serialized, /password|secret|token|private[.]key|C:[\\\\/]Users/i);
});

test("each readiness call returns independent blocker objects", () => {
  const first = getFullSchoolReadiness();
  const second = getFullSchoolReadiness();
  assert.notEqual(first.blockers, second.blockers);
  assert.notEqual(first.blockers[0], second.blockers[0]);
  assert.ok(first.checkedAt);
});
