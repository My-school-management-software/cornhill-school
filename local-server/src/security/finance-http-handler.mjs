import { randomUUID } from "node:crypto";
import {
  AuthenticationError,
  AuthenticationRateLimitError,
  AuthenticationServiceError,
  CsrfValidationError
} from "./auth-service.mjs";
import { staffHasPermission } from "./authorization.mjs";
import { readSessionTokenFromCookieHeader } from "./session-cookies.mjs";

const MAX_BODY_BYTES = 16 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_METHODS = new Set(["cash", "mobile_money", "bank_transfer", "card", "cheque"]);
const RESPONSE_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security": "max-age=86400"
});

class FinanceInputError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...RESPONSE_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

async function readJsonBody(request) {
  const contentType = String(request.headers["content-type"] ?? "")
    .split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new FinanceInputError(415, "JSON content is required.");
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new FinanceInputError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  if (total === 0) throw new FinanceInputError(400, "A JSON request body is required.");
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new FinanceInputError(400, "Request body is not valid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FinanceInputError(400, "Request body must be a JSON object.");
  }
  return value;
}

function validatePaymentBody(body, idempotencyKey, actorStaffId) {
  if (!UUID_PATTERN.test(idempotencyKey ?? "")) {
    throw new FinanceInputError(400, "A valid Idempotency-Key header is required.");
  }
  if (typeof body.learnerId !== "string" || !UUID_PATTERN.test(body.learnerId)) {
    throw new FinanceInputError(400, "Select a valid learner.");
  }
  if (!Number.isSafeInteger(body.amountUgx) || body.amountUgx <= 0) {
    throw new FinanceInputError(400, "Payment amount must be a positive whole-UGX number.");
  }
  if (!ALLOWED_METHODS.has(body.paymentMethod)) {
    throw new FinanceInputError(400, "Select a supported payment method.");
  }
  if ((body.paymentMethod === "mobile_money" && !["MTN", "Airtel"].includes(body.mobileMoneyProvider)) ||
      (body.paymentMethod !== "mobile_money" && body.mobileMoneyProvider != null)) {
    throw new FinanceInputError(400, "Select MTN or Airtel for mobile money payments only.");
  }
  if (!Array.isArray(body.allocations) || body.allocations.length > 100) {
    throw new FinanceInputError(400, "Payment allocations must be a list of at most 100 fee balances.");
  }
  let allocated = 0;
  const seen = new Set();
  const allocations = body.allocations.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.feeObligationId !== "string" || !UUID_PATTERN.test(item.feeObligationId) ||
        !Number.isSafeInteger(item.amountUgx) || item.amountUgx <= 0) {
      throw new FinanceInputError(400, "Each allocation must identify a fee balance and a positive whole-UGX amount.");
    }
    const id = item.feeObligationId.toLowerCase();
    if (seen.has(id)) throw new FinanceInputError(400, "A fee balance may only appear once in a payment.");
    seen.add(id);
    allocated += item.amountUgx;
    if (!Number.isSafeInteger(allocated) || allocated > body.amountUgx) {
      throw new FinanceInputError(400, "Allocated amounts cannot exceed the payment received.");
    }
    return { fee_obligation_id: item.feeObligationId, amount_ugx: item.amountUgx };
  });

  for (const [field, max] of [["collectionItem", 100], ["payerName", 140], ["externalReference", 120], ["notes", 1000]]) {
    if (body[field] != null && (typeof body[field] !== "string" || body[field].trim().length > max)) {
      throw new FinanceInputError(400, "One of the payment description fields is invalid.");
    }
  }
  return {
    actorStaffId,
    learnerId: body.learnerId,
    amountUgx: body.amountUgx,
    paymentMethod: body.paymentMethod,
    idempotencyKey,
    allocations,
    mobileMoneyProvider: body.mobileMoneyProvider ?? null,
    externalReference: body.externalReference?.trim() || null,
    collectionItem: body.collectionItem?.trim() || "School fees",
    payerName: body.payerName?.trim() || null,
    notes: body.notes?.trim() || null
  };
}

function mapFailure(error) {
  if (error instanceof FinanceInputError) return { status: error.statusCode, message: error.message };
  if (error instanceof AuthenticationRateLimitError) return { status: 429, message: error.message };
  if (error instanceof AuthenticationError) return { status: 401, message: "A valid staff session is required." };
  if (error instanceof CsrfValidationError) return { status: 403, message: error.message };
  if (error instanceof AuthenticationServiceError) return { status: 503, message: error.message };
  if (error?.code === "42501") return { status: 403, message: "You do not have permission for this finance operation." };
  if (error?.code === "P0002") return { status: 404, message: "The requested payment receipt was not found." };
  if (error?.code === "22023") return { status: 400, message: "The finance request contains invalid information." };
  if (error?.code === "23514") return { status: 409, message: "The payment conflicts with the learner's current fee balance." };
  if (error?.code === "23505") return { status: 409, message: "This payment request has already been used or conflicts with an existing payment." };
  return { status: 503, message: "The local finance service is temporarily unavailable." };
}

export function createFinanceHttpHandler({ authService, financeRepository, expectedOrigin } = {}) {
  if (!authService || typeof authService.authenticate !== "function") {
    throw new TypeError("A local authentication service is required for finance routes.");
  }
  for (const method of ["searchLearners", "getLearnerAccount", "postPayment", "reprintReceipt", "allocateCredit"]) {
    if (!financeRepository || typeof financeRepository[method] !== "function") {
      throw new TypeError("A complete local finance repository is required.");
    }
  }
  let origin;
  try { origin = new URL(expectedOrigin); }
  catch { throw new TypeError("Finance API origin must be a valid HTTPS origin."); }
  if (origin.protocol !== "https:" || origin.origin !== expectedOrigin || origin.pathname !== "/" ||
      origin.username || origin.password || origin.search || origin.hash) {
    throw new TypeError("Finance API origin must be an exact HTTPS origin.");
  }

  return async function handleFinanceRequest(request, response) {
    let url;
    try { url = new URL(request.url ?? "/", origin); }
    catch { return false; }
    const path = url.pathname;
    if (!path.startsWith("/api/v1/finance/")) return false;

    const method = String(request.method ?? "GET").toUpperCase();
    if (request.socket?.encrypted !== true) {
      sendJson(response, 426, { error: "Secure HTTPS transport is required." });
      return true;
    }
    if (request.headers.host !== origin.host) {
      sendJson(response, 421, { error: "Request host is not authorised." });
      return true;
    }
    if (!["GET", "POST"].includes(method)) {
      response.writeHead(405, { ...RESPONSE_HEADERS, Allow: "GET, POST", "Content-Length": 0 });
      response.end();
      return true;
    }

    try {
      if (method === "POST" && request.headers.origin !== origin.origin) {
        sendJson(response, 403, { error: "The request origin is not authorised." });
        return true;
      }
      const sessionToken = readSessionTokenFromCookieHeader(request.headers.cookie);
      const csrfHeader = request.headers["x-cornhill-csrf"];
      const principal = await authService.authenticate({
        sessionToken,
        method,
        csrfToken: typeof csrfHeader === "string" ? csrfHeader : undefined
      });
      const receiptReprintMatch = path.match(/^\/api\/v1\/finance\/receipts\/(CR-[0-9]{4}-[0-9]{7})\/reprint$/);
      const requiredPermission = receiptReprintMatch && method === "POST"
        ? "finance.receipts_reprint"
        : "finance.payments_record";
      if (!staffHasPermission({ principal, permissionCode: requiredPermission })) {
        sendJson(response, 403, { error: "You do not have permission for this finance operation." });
        return true;
      }

      const learnerSearchMatch = path === "/api/v1/finance/learners" && method === "GET";
      if (learnerSearchMatch) {
        const search = url.searchParams.get("search") ?? "";
        if (search.trim().length < 2 || search.trim().length > 80) {
          throw new FinanceInputError(400, "Enter at least two characters of a learner name or pupil code.");
        }
        const learners = await financeRepository.searchLearners({
          actorStaffId: principal.id,
          search: search.trim()
        });
        sendJson(response, 200, { learners });
        return true;
      }

      const accountMatch = path.match(/^\/api\/v1\/finance\/learners\/([0-9a-f-]{36})\/account$/i);
      if (accountMatch && method === "GET") {
        const learnerId = accountMatch[1];
        if (!UUID_PATTERN.test(learnerId)) throw new FinanceInputError(400, "Learner ID is invalid.");
        const account = await financeRepository.getLearnerAccount({
          actorStaffId: principal.id,
          learnerId
        });
        if (!account) {
          sendJson(response, 404, { error: "The active learner record was not found." });
          return true;
        }
        sendJson(response, 200, { account });
        return true;
      }

      if (creditAllocateRoute) {
        const body = await readJsonBody(request);
        const idempotencyKey = request.headers["idempotency-key"];
        if (!UUID_PATTERN.test(idempotencyKey ?? "")) {
          throw new FinanceInputError(400, "A valid Idempotency-Key header is required.");
        }
        if (typeof body.sourcePaymentId !== "string" || !UUID_PATTERN.test(body.sourcePaymentId)) {
          throw new FinanceInputError(400, "Select a valid original payment with retained credit.");
        }
        if (!Array.isArray(body.allocations) || body.allocations.length < 1 || body.allocations.length > 100) {
          throw new FinanceInputError(400, "Choose between 1 and 100 fee balances for credit allocation.");
        }
        const seen = new Set();
        const allocations = body.allocations.map(item => {
          if (!item || typeof item !== "object" || Array.isArray(item) ||
              typeof item.feeObligationId !== "string" || !UUID_PATTERN.test(item.feeObligationId) ||
              !Number.isSafeInteger(item.amountUgx) || item.amountUgx <= 0) {
            throw new FinanceInputError(400, "Each credit allocation must contain a fee ID and positive whole-UGX amount.");
          }
          const id = item.feeObligationId.toLowerCase();
          if (seen.has(id)) throw new FinanceInputError(400, "A fee balance may only appear once in a credit allocation.");
          seen.add(id);
          return { fee_obligation_id: item.feeObligationId, amount_ugx: item.amountUgx };
        });
        if (typeof body.reason !== "string" || body.reason.trim().length < 5 || body.reason.trim().length > 300) {
          throw new FinanceInputError(400, "Enter a credit allocation reason between 5 and 300 characters.");
        }
        const allocation = await financeRepository.allocateCredit({
          actorStaffId: principal.id,
          sourcePaymentId: body.sourcePaymentId,
          idempotencyKey,
          allocations,
          reason: body.reason.trim()
        });
        sendJson(response, 200, { allocation });
        return true;
      }

      if (path === "/api/v1/finance/payments" && method === "POST") {
        const body = await readJsonBody(request);
        const payment = validatePaymentBody(body, request.headers["idempotency-key"], principal.id);
        const result = await financeRepository.postPayment(payment);
        sendJson(response, 201, { payment: result });
        return true;
      }

      if (receiptReprintMatch && method === "POST") {
        const body = await readJsonBody(request);
        if (typeof body.reason !== "string" || body.reason.trim().length < 5 || body.reason.trim().length > 300) {
          throw new FinanceInputError(400, "Enter a reprint reason between 5 and 300 characters.");
        }
        const receipt = await financeRepository.reprintReceipt({
          actorStaffId: principal.id,
          receiptNumber: receiptReprintMatch[1],
          reason: body.reason.trim()
        });
        if (!receipt) {
          sendJson(response, 404, { error: "The requested payment receipt was not found." });
          return true;
        }
        sendJson(response, 200, { receipt });
        return true;
      }

      sendJson(response, 404, { error: "Finance route not found." });
      return true;
    } catch (error) {
      const mapped = mapFailure(error);
      sendJson(response, mapped.status, { error: mapped.message, requestId: randomUUID() });
      return true;
    }
  };
}
