import { createLocalAuthRuntime } from "../src/security/auth-runtime.mjs";
import { createCornhillHttpsServer } from "../src/https-server.mjs";

const host = process.env.CORNHILL_LOCAL_HOST ?? "127.0.0.1";
const port = Number(process.env.CORNHILL_LOCAL_PORT ?? "4174");
const keyPath = process.env.CORNHILL_TLS_KEY_PATH;
const certPath = process.env.CORNHILL_TLS_CERT_PATH;

let runtime;
let server;

async function start() {
  runtime = await createLocalAuthRuntime();
  server = await createCornhillHttpsServer({
    authHandler: runtime.authHandler,
    financeApiEnabled: runtime.financeEnabled,
    expectedOrigin: process.env.CORNHILL_LOCAL_ORIGIN,
    keyPath,
    certPath,
    host,
    port
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  console.log("CORNHILL local HTTPS service is listening at " + process.env.CORNHILL_LOCAL_ORIGIN);
  console.log("Bursar finance API enabled: " + (runtime.financeEnabled ? "yes" : "no"));
  console.log("Loopback-only. No LAN clients are accepted by this listener.");
  console.log("Press Ctrl+C to stop.");
}

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  } finally {
    if (runtime) await runtime.close();
  }
}

process.once("SIGINT", () => { void stop().finally(() => process.exit(0)); });
process.once("SIGTERM", () => { void stop().finally(() => process.exit(0)); });

start().catch(async error => {
  console.error("CORNHILL local authentication API did not start:", error.message);
  try {
    if (server?.listening) {
      await new Promise(resolve => server.close(() => resolve()));
    }
  } finally {
    if (runtime) await runtime.close();
  }
  process.exitCode = 1;
});