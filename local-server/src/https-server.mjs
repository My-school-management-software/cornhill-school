import { createServer as createHttpsServer } from "node:https";
import { createSecureContext } from "node:tls";
import { X509Certificate } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(MODULE_DIR, "../..");
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security": "max-age=86400"
});

function assertLoopbackHost(host) {
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new TypeError("Local authentication HTTPS server must bind to loopback only.");
  }
}

function assertPort(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new TypeError("Local authentication HTTPS port must be between 1024 and 65535.");
  }
}

function assertHandler(handler) {
  if (typeof handler !== "function") {
    throw new TypeError("An HTTPS authentication route handler is required.");
  }
}

function assertOutsideRepository(filePath, label) {
  if (typeof filePath !== "string" || filePath.length === 0 || !isAbsolute(filePath)) {
    throw new TypeError(label + " must be an absolute path.");
  }
  const target = resolve(filePath);
  const relativePath = relative(REPOSITORY_ROOT, target);
  const insideRepository = relativePath === "" ||
    (!relativePath.startsWith(".." + sep) && relativePath !== ".." && !isAbsolute(relativePath));
  if (insideRepository) {
    throw new TypeError(label + " must be stored outside the source repository.");
  }
}

async function readTlsMaterial({ keyPath, certPath, expectedHostname }) {
  assertOutsideRepository(keyPath, "TLS private key");
  assertOutsideRepository(certPath, "TLS certificate");

  const [actualKeyPath, actualCertPath] = await Promise.all([
    realpath(keyPath),
    realpath(certPath)
  ]);
  assertOutsideRepository(actualKeyPath, "TLS private key");
  assertOutsideRepository(actualCertPath, "TLS certificate");

  const [keyStats, key, cert] = await Promise.all([
    stat(actualKeyPath),
    readFile(actualKeyPath),
    readFile(actualCertPath)
  ]);

  if (process.platform !== "win32" && (keyStats.mode & 0o077) !== 0) {
    throw new Error("TLS private key file permissions are too broad.");
  }

  const x509 = new X509Certificate(cert);
  if (!x509.checkHost(expectedHostname)) {
    throw new Error("TLS certificate does not match the configured local HTTPS hostname.");
  }
  const now = Date.now();
  if (Date.parse(x509.validFrom) > now || Date.parse(x509.validTo) <= now) {
    throw new Error("TLS certificate is not currently valid.");
  }

  // Validate that the certificate and private key form a usable pair.
  createSecureContext({ key, cert, minVersion: "TLSv1.2", maxVersion: "TLSv1.3" });
  return { key, cert };
}

function sendJson(response, statusCode, payload, method = "GET") {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length
  });
  response.end(method === "HEAD" ? undefined : body);
}

export async function createCornhillHttpsServer({
  authHandler,
  expectedOrigin,
  keyPath,
  certPath,
  host = "127.0.0.1",
  port = 4174
} = {}) {
  assertHandler(authHandler);
  assertLoopbackHost(host);
  assertPort(port);

  let origin;
  try {
    origin = new URL(expectedOrigin);
  } catch {
    throw new TypeError("Expected local HTTPS origin must be a valid HTTPS URL.");
  }
  if (origin.protocol !== "https:" || origin.origin !== expectedOrigin ||
      origin.username || origin.password || origin.pathname !== "/" ||
      origin.search || origin.hash) {
    throw new TypeError("Expected local HTTPS origin must be an exact HTTPS origin.");
  }

  const tls = await readTlsMaterial({
    keyPath,
    certPath,
    expectedHostname: origin.hostname
  });

  return createHttpsServer({
    ...tls,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3",
    requestCert: false,
    rejectUnauthorized: true
  }, (request, response) => {
    void (async () => {
      const path = new URL(request.url ?? "/", expectedOrigin).pathname;
      const method = String(request.method ?? "GET").toUpperCase();

      if (path === "/api/v1/health") {
        if (method !== "GET" && method !== "HEAD") {
          response.writeHead(405, { ...SECURITY_HEADERS, Allow: "GET, HEAD", "Content-Length": 0 });
          response.end();
          return;
        }
        sendJson(response, 200, {
          status: "ok",
          service: "cornhill-local-auth-api",
          transport: "https",
          bind: "loopback-only",
          schoolDataEnabled: false
        }, method);
        return;
      }

      const handled = await authHandler(request, response);
      if (handled) return;
      sendJson(response, 404, { error: "Local API route not found." }, method);
    })().catch(() => {
      if (response.headersSent) {
        response.destroy();
      } else {
        sendJson(response, 503, { error: "Local API service is temporarily unavailable." });
      }
    });
  });
}