import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const STATUS_PAGE = resolve(MODULE_DIR, "../public/status.html");
const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
};

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  response.end(body);
}

export function createCornhillServer({ port = DEFAULT_PORT } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TypeError("Port must be an integer between 0 and 65535.");
  }

  return createServer(async (request, response) => {
    let url;
    try {
      url = new URL(request.url ?? "/", "http://127.0.0.1");
    } catch {
      sendJson(response, 400, { error: "Bad request." });
      return;
    }

    if (url.pathname === "/api/v1/health") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { ...SECURITY_HEADERS, Allow: "GET, HEAD", "Cache-Control": "no-store" });
        response.end();
        return;
      }

      const payload = {
        status: "ok",
        service: "cornhill-local-server",
        stage: "health-only-scaffold",
        database: "not-configured",
        authentication: "not-configured",
        schoolDataEnabled: false
      };
      if (request.method === "HEAD") {
        response.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end();
      } else {
        sendJson(response, 200, payload);
      }
      return;
    }

    if ((url.pathname === "/" || url.pathname === "/status.html") &&
        (request.method === "GET" || request.method === "HEAD")) {
      try {
        const body = await readFile(STATUS_PAGE);
        response.writeHead(200, {
          ...SECURITY_HEADERS,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": body.byteLength,
          "Cache-Control": "no-store"
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        console.error("Could not read the local status page:", error);
        sendJson(response, 500, { error: "The local status page is unavailable." });
      }
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { ...SECURITY_HEADERS, Allow: "GET, HEAD", "Cache-Control": "no-store" });
      response.end();
      return;
    }

    sendJson(response, 404, { error: "This local prototype route is not available." });
  });
}

async function start() {
  const rawPort = process.env.CORNHILL_LOCAL_PORT ?? String(DEFAULT_PORT);
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("CORNHILL_LOCAL_PORT must be a whole number between 1024 and 65535.");
  }

  const server = createCornhillServer({ port });
  server.listen(port, LOOPBACK_HOST, () => {
    console.log("CORNHILL local scaffold listening at http://127.0.0.1:" + port);
    console.log("Loopback only. No database, login, or school records are connected.");
    console.log("Press Ctrl+C to stop.");
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  start().catch(error => {
    console.error("CORNHILL local scaffold failed to start:", error.message);
    process.exitCode = 1;
  });
}
