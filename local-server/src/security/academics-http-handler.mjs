import {
  AuthenticationError, AuthenticationServiceError, CsrfValidationError
} from "./auth-service.mjs";
import {
  AuthorizationError, isLocalUuid, staffHasClassAssignment, staffHasPermission
} from "./authorization.mjs";
import {
  readSessionTokenFromCookieHeader, readCsrfTokenFromCookieHeader
} from "./session-cookies.mjs";

const MAX_BODY = 512 * 1024;
const MAX_MARKS_PER_SAVE = 500;
const CLASS_SCOPED_ROLES = new Set([
  "teacher", "class_teacher", "upper_primary_teacher", "lower_primary_teacher", "nursery_head"
]);
const ASSESSMENT_TYPES = new Set([
  "Beginning of Term", "Mid Term", "End of Term", "Continuous Assessment", "Mock", "Practice"
]);
const HEADERS = Object.freeze({
  "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security": "max-age=86400"
});
class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function send(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.writeHead(status, {
    ...HEADERS, "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length
  });
  response.end(body);
}
async function readJson(request) {
  const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new InputError("JSON content is required.", 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new InputError("Request body is too large.", 413);
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new InputError("Request body is not valid JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InputError("A JSON object is required.");
  }
  return body;
}
function shortText(value, max, label) {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > max) {
    throw new InputError(label + " is invalid.");
  }
  return value.trim();
}
function parseAssessmentInput(body) {
  if (!isLocalUuid(body.academicTermId) || !isLocalUuid(body.classId)) {
    throw new InputError("Choose a valid academic term and class.");
  }
  if (!ASSESSMENT_TYPES.has(body.assessmentType)) {
    throw new InputError("Choose a supported assessment type.");
  }
  const maxScore = Number(body.maxScore);
  if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 10000) {
    throw new InputError("Maximum score must be greater than zero and no more than 10,000.");
  }
  let assessmentDate = null;
  if (body.assessmentDate != null && body.assessmentDate !== "") {
    if (typeof body.assessmentDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.assessmentDate)) {
      throw new InputError("Assessment date must use YYYY-MM-DD.");
    }
    assessmentDate = body.assessmentDate;
  }
  return {
    academicTermId: body.academicTermId, classId: body.classId,
    assessmentName: shortText(body.assessmentName, 100, "Assessment name"),
    assessmentType: body.assessmentType, assessmentDate, maxScore
  };
}
function parseMarks(body) {
  if (!isLocalUuid(body.assessmentId) || !isLocalUuid(body.classId) ||
      !Array.isArray(body.marks) || body.marks.length < 1 ||
      body.marks.length > MAX_MARKS_PER_SAVE) {
    throw new InputError("Assessment, class or mark list is invalid.");
  }
  const seen = new Set();
  const marks = body.marks.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        !isLocalUuid(row.learnerId) || !isLocalUuid(row.subjectId)) {
      throw new InputError("Mark row " + (index + 1) + " has an invalid learner or subject.");
    }
    const key = row.learnerId + ":" + row.subjectId;
    if (seen.has(key)) throw new InputError("A learner subject mark appears more than once.");
    seen.add(key);
    const score = Number(row.score);
    if (!Number.isFinite(score) || score < 0 || score > 10000) {
      throw new InputError("Every score must be a valid non-negative number.");
    }
    const comment = row.comment == null || row.comment === ""
      ? null : shortText(row.comment, 600, "Teacher comment");
    return { learnerId: row.learnerId, subjectId: row.subjectId, score, comment };
  });
  return { assessmentId: body.assessmentId, classId: body.classId, marks };
}
function isClassScoped(principal) {
  return principal.roles.some(role => CLASS_SCOPED_ROLES.has(role));
}
function requireAcademicPermission(principal, codes) {
  if (principal.principalType !== "staff" ||
      !codes.some(permissionCode => staffHasPermission({ principal, permissionCode }))) {
    throw new AuthorizationError();
  }
}
function requireClassScope(principal, classId) {
  if (!staffHasClassAssignment({ principal, classId })) throw new AuthorizationError();
}

export function createAcademicsHttpHandler({ authService, academicsRepository, expectedOrigin } = {}) {
  if (!authService || typeof authService.authenticate !== "function" ||
      !academicsRepository || typeof academicsRepository.listWorkspace !== "function" ||
      typeof academicsRepository.getAssessment !== "function" ||
      typeof academicsRepository.getAssessmentMarks !== "function" ||
      typeof academicsRepository.createAssessment !== "function" ||
      typeof academicsRepository.transitionAssessment !== "function" ||
      typeof academicsRepository.saveMarks !== "function") {
    throw new TypeError("Academic API dependencies are incomplete.");
  }
  let origin;
  try { origin = new URL(expectedOrigin); }
  catch { throw new TypeError("An exact HTTPS origin is required."); }
  if (origin.protocol !== "https:" || origin.origin !== expectedOrigin ||
      origin.pathname !== "/" || origin.search || origin.hash) {
    throw new TypeError("An exact HTTPS origin is required.");
  }

  return async function handleAcademics(request, response) {
    const url = new URL(request.url ?? "/", origin);
    const marksMatch = url.pathname.match(/^\/api\/v1\/academics\/assessments\/([0-9a-f-]{36})\/marks$/i);
    const statusMatch = url.pathname.match(/^\/api\/v1\/academics\/assessments\/([0-9a-f-]{36})\/status$/i);
    const isWorkspace = url.pathname === "/api/v1/academics/workspace";
    const isAssessments = url.pathname === "/api/v1/academics/assessments";
    const isMarks = url.pathname === "/api/v1/academics/marks";
    if (!isWorkspace && !isAssessments && !isMarks && !marksMatch && !statusMatch) return false;

    const method = String(request.method ?? "GET").toUpperCase();
    const allowed = isWorkspace || marksMatch ? ["GET", "HEAD"] :
      isAssessments ? ["GET", "HEAD", "POST"] :
      isMarks ? ["POST"] : ["PATCH"];
    if (!allowed.includes(method)) {
      response.writeHead(405, { ...HEADERS, Allow: allowed.join(", "), "Content-Length": 0 });
      response.end();
      return true;
    }
    if (request.socket?.encrypted !== true) {
      send(response, 426, { error: "Secure HTTPS transport is required." });
      return true;
    }
    if (request.headers.host !== origin.host ||
        (method !== "GET" && method !== "HEAD" && request.headers.origin !== origin.origin)) {
      send(response, 421, { error: "Request origin is not authorised." });
      return true;
    }

    try {
      const csrfToken = method === "GET" || method === "HEAD" ? undefined :
        request.headers["x-cornhill-csrf"] ?? readCsrfTokenFromCookieHeader(request.headers.cookie);
      const principal = await authService.authenticate({
        sessionToken: readSessionTokenFromCookieHeader(request.headers.cookie),
        method, csrfToken
      });

      if (isWorkspace || isAssessments) {
        requireAcademicPermission(principal, [
          "academics.terms_manage", "academics.assessments_manage",
          "academics.marks_enter", "academics.results_view", "academics.results_publish"
        ]);
        const classId = url.searchParams.get("classId") || null;
        if (classId && !isLocalUuid(classId)) throw new InputError("Class identifier is invalid.");
        if (classId && isClassScoped(principal)) requireClassScope(principal, classId);
        const classIds = isClassScoped(principal) ? principal.classIds : null;
        if (isAssessments && method === "POST") {
          requireAcademicPermission(principal, ["academics.assessments_manage"]);
          const body = parseAssessmentInput(await readJson(request));
          if (isClassScoped(principal)) requireClassScope(principal, body.classId);
          const assessment = await academicsRepository.createAssessment({
            ...body, staffId: principal.id
          });
          send(response, 201, { assessment });
          return true;
        }
        const workspace = await academicsRepository.listWorkspace({ classIds, classId });
        send(response, 200, workspace, method);
        return true;
      }

      if (marksMatch) {
        requireAcademicPermission(principal, ["academics.results_view", "academics.marks_enter"]);
        const details = await academicsRepository.getAssessmentMarks(marksMatch[1]);
        if (!details) {
          send(response, 404, { error: "Assessment was not found." }, method);
          return true;
        }
        if (isClassScoped(principal)) requireClassScope(principal, details.assessment.classId);
        if (!staffHasPermission({ principal, permissionCode: "academics.results_view" }) &&
            !staffHasPermission({ principal, permissionCode: "academics.marks_enter" })) {
          throw new AuthorizationError();
        }
        send(response, 200, details, method);
        return true;
      }

      if (isMarks) {
        requireAcademicPermission(principal, ["academics.marks_enter"]);
        const input = parseMarks(await readJson(request));
        requireClassScope(principal, input.classId);
        const assessment = await academicsRepository.getAssessment(input.assessmentId);
        if (!assessment || assessment.classId !== input.classId) {
          send(response, 404, { error: "Assessment was not found for the selected class." });
          return true;
        }
        const result = await academicsRepository.saveMarks({
          ...input, staffId: principal.id
        });
        send(response, 200, result);
        return true;
      }

      if (statusMatch) {
        const body = await readJson(request);
        const nextStatus = body.status;
        if (nextStatus === "Published") {
          requireAcademicPermission(principal, ["academics.results_publish"]);
        } else {
          requireAcademicPermission(principal, ["academics.assessments_manage"]);
        }
        if (!["Open", "Locked", "Published", "Archived"].includes(nextStatus)) {
          throw new InputError("Assessment status is invalid.");
        }
        const assessment = await academicsRepository.getAssessment(statusMatch[1]);
        if (!assessment) {
          send(response, 404, { error: "Assessment was not found." });
          return true;
        }
        if (isClassScoped(principal)) requireClassScope(principal, assessment.classId);
        const updated = await academicsRepository.transitionAssessment({
          assessmentId: statusMatch[1], nextStatus, staffId: principal.id
        });
        send(response, 200, { assessment: { ...assessment, ...updated } });
        return true;
      }
    } catch (error) {
      if (error instanceof InputError) send(response, error.status, { error: error.message });
      else if (error instanceof AuthenticationError) send(response, 401, { error: "A valid staff session is required." });
      else if (error instanceof AuthorizationError) send(response, 403, { error: "You are not authorised to access this academic record." });
      else if (error instanceof CsrfValidationError) send(response, 403, { error: "The request could not be verified." });
      else if (error instanceof AuthenticationServiceError) send(response, 503, { error: "Authentication is temporarily unavailable." });
      else if (error?.code === "CORNHILL_ACADEMIC_CONFLICT" || error?.code === "23505" ||
               error?.code === "23514" || error?.code === "23503") {
        send(response, 409, { error: error.message === "Assessment not found." ? error.message : "The academic change conflicts with the current assessment or learner records." });
      } else {
        send(response, 503, { error: "The academic request could not be completed." });
      }
    }
    return true;
  };
}
