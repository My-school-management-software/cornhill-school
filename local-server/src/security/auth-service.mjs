import { createHmac, randomUUID } from "node:crypto";
import {
  LOCAL_AUTHORIZATION_CATALOG,
  sessionMatchesPrincipal
} from "./authorization.mjs";
import {
  createOpaqueSessionSecrets,
  hashOpaqueToken,
  verifyOpaqueToken
} from "./session-tokens.mjs";

const STAFF_ROLES = new Set(LOCAL_AUTHORIZATION_CATALOG.staffRoles);
const COOKIE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ARGON2ID_PREFIX = "$argon2id$";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class AuthenticationError extends Error {
  constructor() {
    super("The sign-in details could not be verified.");
    this.name = "AuthenticationError";
    this.statusCode = 401;
  }
}

export class AuthenticationRateLimitError extends Error {
  constructor() {
    super("Too many sign-in attempts. Please try again later.");
    this.name = "AuthenticationRateLimitError";
    this.statusCode = 429;
  }
}

export class AuthenticationServiceError extends Error {
  constructor() {
    super("The authentication service is temporarily unavailable.");
    this.name = "AuthenticationServiceError";
    this.statusCode = 503;
  }
}

export class CsrfValidationError extends Error {
  constructor() {
    super("The request could not be verified.");
    this.name = "CsrfValidationError";
    this.statusCode = 403;
  }
}

export function createCredentialFingerprinter(secret) {
  const key = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret ?? ""), "utf8");
  if (key.byteLength < 32) {
    throw new TypeError("Authentication fingerprint secret must contain at least 32 bytes.");
  }
  return value => {
    if (typeof value !== "string" || value.length === 0 || value.length > 256) {
      throw new TypeError("Fingerprint input is invalid.");
    }
    return createHmac("sha256", key).update(value, "utf8").digest("hex");
  };
}

export function normalizeStaffIdentifier(value) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  return normalized.length >= 3 && normalized.length <= 120 ? normalized : null;
}

export function normalizeGuardianPhone(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^\+[1-9][0-9]{7,14}$/.test(normalized) ? normalized : null;
}

function safePrincipal(account, principalType) {
  const principal = {
    id: account.id,
    principalType,
    accountStatus: account.accountStatus,
    displayName: typeof account.displayName === "string"
      ? account.displayName.slice(0, 100)
      : principalType === "staff" && typeof account.username === "string"
        ? account.username.slice(0, 100)
        : "Guardian"
  };

  if (principalType === "staff") {
    principal.roles = Array.isArray(account.roles)
      ? [...new Set(account.roles.filter(role => STAFF_ROLES.has(role)))]
      : [];
    principal.classIds = Array.isArray(account.classIds)
      ? [...new Set(account.classIds.filter(id =>
          typeof id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        ))]
      : [];
  }
  return Object.freeze(principal);
}

function validCredential(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1024;
}

function validArgon2idHash(value) {
  return typeof value === "string" &&
    value.startsWith(ARGON2ID_PREFIX) &&
    value.length >= 30 &&
    value.length <= 512;
}

function asMilliseconds(value) {
  const parsed = value instanceof Date ? value.getTime() :
    typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function makeCorrelationId() {
  return randomUUID();
}

export function createAuthService({
  accountRepository,
  loginAttemptStore,
  sessionRepository,
  auditRepository,
  passwordHasher,
  dummyArgon2idHash,
  fingerprintSecret,
  tokenFactory = createOpaqueSessionSecrets,
  clock = () => new Date(),
  staffSessionTtlMs = 8 * 60 * 60 * 1000,
  guardianSessionTtlMs = 30 * 60 * 1000,
  maxFailedAttempts = 5,
  rateWindowMs = 15 * 60 * 1000
} = {}) {
  const required = [
    [accountRepository, ["findStaffByUsername", "findGuardianByPhone"]],
    [loginAttemptStore, ["beginAttempt", "completeAttempt"]],
    [sessionRepository, [
      "createAuthenticatedSession",
      "findActiveSessionByTokenHash",
      "revokeSessionByTokenHash"
    ]],
    [auditRepository, ["recordAuthenticationEvent"]],
    [passwordHasher, ["verify"]]
  ];
  for (const [dependency, methods] of required) {
    if (!dependency || methods.some(method => typeof dependency[method] !== "function")) {
      throw new TypeError("Authentication service dependency is incomplete.");
    }
  }
  if (!validArgon2idHash(dummyArgon2idHash)) {
    throw new TypeError("A valid Argon2id dummy hash is required.");
  }
  if (typeof passwordHasher.isArgon2idHash !== "function") {
    throw new TypeError("Password hasher must identify Argon2id encoded hashes.");
  }
  if (!passwordHasher.isArgon2idHash(dummyArgon2idHash)) {
    throw new TypeError("Dummy credential hash does not meet the Argon2id policy.");
  }
  if (!Number.isInteger(staffSessionTtlMs) || staffSessionTtlMs < 60_000 ||
      !Number.isInteger(guardianSessionTtlMs) || guardianSessionTtlMs < 60_000 ||
      !Number.isInteger(maxFailedAttempts) || maxFailedAttempts < 1 ||
      !Number.isInteger(rateWindowMs) || rateWindowMs < 60_000) {
    throw new TypeError("Authentication expiry and throttling settings are invalid.");
  }

  const fingerprint = createCredentialFingerprinter(fingerprintSecret);

  async function audit(input) {
    await auditRepository.recordAuthenticationEvent({
      ...input,
      correlationId: makeCorrelationId()
    });
  }

  async function login({ principalType, identifier, credential, sourceAddress }) {
    const normalizedIdentifier = principalType === "staff"
      ? normalizeStaffIdentifier(identifier)
      : normalizeGuardianPhone(identifier);

    if (!normalizedIdentifier || !validCredential(credential)) {
      throw new AuthenticationError();
    }

    const identifierFingerprint = fingerprint(principalType + ":" + normalizedIdentifier);
    const sourceFingerprint = typeof sourceAddress === "string" && sourceAddress.length > 0
      ? fingerprint("source:" + sourceAddress.slice(0, 256))
      : null;
    const now = clock();
    const nowMs = asMilliseconds(now);
    if (!Number.isFinite(nowMs)) throw new AuthenticationServiceError();

    let attempt;
    try {
      attempt = await loginAttemptStore.beginAttempt({
        principalType,
        identifierFingerprint,
        sourceFingerprint,
        attemptedAt: new Date(nowMs),
        windowMs: rateWindowMs,
        maxFailedAttempts
      });
    } catch {
      throw new AuthenticationServiceError();
    }

    if (!attempt || attempt.allowed !== true || attempt.attemptId == null) {
      try {
        await audit({
          principalType,
          eventCode: "authentication.rate_limited",
          outcome: "denied",
          identifierFingerprint
        });
      } catch {
        throw new AuthenticationServiceError();
      }
      throw new AuthenticationRateLimitError();
    }

    let account = null;
    let verified = false;
    try {
      account = principalType === "staff"
        ? await accountRepository.findStaffByUsername(normalizedIdentifier)
        : await accountRepository.findGuardianByPhone(normalizedIdentifier);

      const storedHash = account && passwordHasher.isArgon2idHash(account.passwordHash ?? account.pinHash)
        ? (account.passwordHash ?? account.pinHash)
        : dummyArgon2idHash;

      // Always run a password verification, including for unknown accounts,
      // to reduce account-enumeration timing differences.
      verified = await passwordHasher.verify(storedHash, credential);
    } catch {
      try {
        await loginAttemptStore.completeAttempt({
          attemptId: attempt.attemptId,
          succeeded: false,
          attemptedAt: new Date(nowMs)
        });
      } catch {
        // The original authentication failure remains the only response.
      }
      throw new AuthenticationServiceError();
    }

    if (!account || account.accountStatus !== "active" || verified !== true ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account.id ?? "")) {
      try {
        const attemptCompleted = await loginAttemptStore.completeAttempt({
          attemptId: attempt.attemptId,
          succeeded: false,
          attemptedAt: new Date(nowMs)
        });
        if (attemptCompleted !== true) throw new Error("Login attempt could not be finalised.");
        await audit({
          principalType,
          eventCode: "authentication.login_denied",
          outcome: "denied",
          identifierFingerprint
        });
      } catch {
        throw new AuthenticationServiceError();
      }
      throw new AuthenticationError();
    }

    const ttl = principalType === "staff" ? staffSessionTtlMs : guardianSessionTtlMs;
    const expiresAt = new Date(nowMs + ttl);
    let secrets;
    try {
      secrets = tokenFactory();
      if (!secrets || !COOKIE_TOKEN_PATTERN.test(secrets.sessionToken ?? "") ||
          !COOKIE_TOKEN_PATTERN.test(secrets.csrfToken ?? "") ||
          !/^[a-f0-9]{64}$/.test(secrets.sessionTokenHash ?? "") ||
          !/^[a-f0-9]{64}$/.test(secrets.csrfTokenHash ?? "")) {
        throw new Error("Invalid token bundle.");
      }

      await sessionRepository.createAuthenticatedSession({
        principalType,
        accountId: account.id,
        tokenHash: secrets.sessionTokenHash,
        csrfTokenHash: secrets.csrfTokenHash,
        createdAt: new Date(nowMs),
        expiresAt,
        loginAttemptId: attempt.attemptId,
        // Session, successful-attempt state, account last_login_at and audit
        // event must be committed together by the PostgreSQL repository.
        correlationId: makeCorrelationId()
      });
    } catch {
      if (secrets?.sessionTokenHash) {
        try {
          await sessionRepository.revokeSessionByTokenHash(secrets.sessionTokenHash, new Date(nowMs));
        } catch {
          // A failed revocation is escalated through the generic service error.
        }
      }
      throw new AuthenticationServiceError();
    }

    return Object.freeze({
      principal: safePrincipal(account, principalType),
      sessionToken: secrets.sessionToken,
      csrfToken: secrets.csrfToken,
      expiresAt,
      cookieMaxAgeSeconds: Math.floor(ttl / 1000)
    });
  }

  async function authenticate({ sessionToken, method = "GET", csrfToken } = {}) {
    if (typeof sessionToken !== "string" || !COOKIE_TOKEN_PATTERN.test(sessionToken)) {
      throw new AuthenticationError();
    }
    let session;
    try {
      const tokenHash = hashOpaqueToken(sessionToken);
      session = await sessionRepository.findActiveSessionByTokenHash(tokenHash);
    } catch {
      throw new AuthenticationServiceError();
    }

    const sessionExpiryMs = session ? asMilliseconds(session.expiresAt) : NaN;
    const currentTimeMs = asMilliseconds(clock());
    if (!session || !sessionMatchesPrincipal(session) ||
        session.revokedAt != null ||
        session.accountStatus !== "active" ||
        !Number.isFinite(sessionExpiryMs) ||
        !Number.isFinite(currentTimeMs) ||
        sessionExpiryMs <= currentTimeMs ||
        !verifyOpaqueToken(sessionToken, session.tokenHash)) {
      throw new AuthenticationError();
    }

    const normalizedMethod = String(method).toUpperCase();
    if (!SAFE_METHODS.has(normalizedMethod) &&
        !verifyOpaqueToken(csrfToken, session.csrfTokenHash)) {
      throw new CsrfValidationError();
    }

    const account = {
      id: session.principalType === "staff" ? session.staffAccountId : session.guardianAccountId,
      accountStatus: session.accountStatus,
      username: session.username,
      displayName: session.displayName,
      roles: session.roles,
      classIds: session.classIds
    };
    return safePrincipal(account, session.principalType);
  }

  async function logout({ sessionToken, csrfToken } = {}) {
    if (typeof sessionToken !== "string" || !COOKIE_TOKEN_PATTERN.test(sessionToken)) return false;
    try {
      const tokenHash = hashOpaqueToken(sessionToken);
      const session = await sessionRepository.findActiveSessionByTokenHash(tokenHash);
      const sessionExpiryMs = session ? asMilliseconds(session.expiresAt) : NaN;
      const currentTimeMs = asMilliseconds(clock());

      if (!session || !sessionMatchesPrincipal(session) ||
          session.revokedAt != null || session.accountStatus !== "active" ||
          !Number.isFinite(sessionExpiryMs) || !Number.isFinite(currentTimeMs) ||
          sessionExpiryMs <= currentTimeMs ||
          !verifyOpaqueToken(sessionToken, session.tokenHash) ||
          !verifyOpaqueToken(csrfToken, session.csrfTokenHash)) {
        return false;
      }

      return await sessionRepository.revokeSessionByTokenHash(
        tokenHash,
        new Date(currentTimeMs)
      ) === true;
    } catch {
      throw new AuthenticationServiceError();
    }
  }

  return Object.freeze({
    loginStaff: ({ username, password, sourceAddress } = {}) =>
      login({ principalType: "staff", identifier: username, credential: password, sourceAddress }),
    loginGuardian: ({ phone, pin, sourceAddress } = {}) =>
      login({ principalType: "guardian", identifier: phone, credential: pin, sourceAddress }),
    authenticate,
    logout
  });
}