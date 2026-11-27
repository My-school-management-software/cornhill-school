// CORNHILL V2.1 — locally stage teacher mark drafts only AFTER authenticating
// staff and independently proving every learner/assessment/subject mapping.
// This service is backend-only; no HTTP route is enabled or registered here.
// The queued draft is NOT a posted mark, approval or cloud synchronization.
import { AuthorizationError, isLocalUuid, staffHasPermission, staffHasClassAssignment } from "../security/authorization.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const INPUT = new Set(["operationId", "learnerSourceId", "assessmentSourceId", "subjectSourceId", "score"]);
const CONFIRMATION = Object.freeze({
  serverMarkPosted: false,
  cloudSyncEnabled: false,
  safeToPublishResults: false,
  automaticReplayEnabled: false
});

function checkInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null)) throw new TypeError("Invalid draft payload");
  if (Object.keys(input).length !== INPUT.size || Object.keys(input).some(key => !INPUT.has(key))) {
    throw new TypeError("Draft fields are not permitted");
  }
  for (const key of ["operationId", "learnerSourceId", "assessmentSourceId", "subjectSourceId"]) {
    if (typeof input[key] !== "string" || !isLocalUuid(input[key]) ||
        input[key] !== input[key].toLowerCase()) throw new TypeError("Invalid draft identifier");
  }
  if (typeof input.score !== "number" || !Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
    throw new TypeError("Draft score is out of range");
  }
}

function verifiedRecordMatches(input, verified) {
  if (!verified || verified.mappingVerified !== true ||
      verified.recordStatus !== "Open" ||
      verified.learnerSourceId !== input.learnerSourceId ||
      verified.assessmentSourceId !== input.assessmentSourceId ||
      verified.subjectSourceId !== input.subjectSourceId ||
      !isLocalUuid(verified.classId) ||
      typeof verified.maxScore !== "number" ||
      !Number.isFinite(verified.maxScore) ||
      verified.maxScore <= 0 || verified.maxScore > 100 ||
      input.score > verified.maxScore ||
      !Number.isSafeInteger(verified.baselineRevision) || verified.baselineRevision < 1 ||
      typeof verified.baselineFingerprint !== "string" ||
      !SHA256.test(verified.baselineFingerprint)) {
    return false;
  }
  return true;
}

export function createOfflineMarkDraftAdmissionService({ recordVerifier, vault } = {}) {
  if (!recordVerifier || typeof recordVerifier.verifyDraftSourceMapping !== "function" ||
      !vault || typeof vault.enqueueDraft !== "function") {
    throw new TypeError("Permissioned mapping verifier and encrypted vault are required");
  }

  async function stage({ principal, input } = {}) {
    if (!staffHasPermission({ principal, permissionCode: "academics.marks_enter" })) {
      throw new AuthorizationError();
    }
    checkInput(input);
    // The backend resolver must use the restricted local database role and verify
    // current class, assessment, active enrolment, subject mapping and source IDs.
    // Never accept mapping/permission claims from a browser or import file.
    const verified = await recordVerifier.verifyDraftSourceMapping({
      learnerSourceId: input.learnerSourceId,
      assessmentSourceId: input.assessmentSourceId,
      subjectSourceId: input.subjectSourceId
    });
    if (!verifiedRecordMatches(input, verified) ||
        !staffHasClassAssignment({ principal, classId: verified.classId })) {
      throw new AuthorizationError();
    }
    const draft = {
      operationId: input.operationId,
      scope: "assessment_score",
      learnerSourceId: input.learnerSourceId,
      assessmentSourceId: input.assessmentSourceId,
      subjectSourceId: input.subjectSourceId,
      actorStaffId: principal.id.toLowerCase(),
      score: input.score,
      baselineRevision: verified.baselineRevision,
      baselineFingerprint: verified.baselineFingerprint
    };
    const queued = await vault.enqueueDraft(draft);
    if (!queued || !["queued_locally", "already_queued"].includes(queued.status)) {
      throw new Error("Encrypted draft was not confirmed");
    }
    return Object.freeze({
      status: queued.status,
      storedLocallyEncrypted: true,
      ...CONFIRMATION
    });
  }
  return Object.freeze({ stage });
}
