import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createCornhillHttpsServer } from "../src/https-server.mjs";

const handler = async () => true;
const validBase = {
  authHandler: handler,
  expectedOrigin: "https://cornhill.local",
  keyPath: "C:\\cornhill-private\\cornhill.key",
  certPath: "C:\\cornhill-private\\cornhill.crt"
};

test("HTTPS server requires an authentication handler", async () => {
  await assert.rejects(
    createCornhillHttpsServer({ ...validBase, authHandler: null }),
    /route handler is required/
  );
});
test("HTTPS server refuses non-loopback bindings", async () => {
  for (const host of ["0.0.0.0", "192.168.1.10", "::"]) {
    await assert.rejects(
      createCornhillHttpsServer({ ...validBase, host }),
      /loopback only/
    );
  }
});
test("HTTPS server rejects invalid ports", async () => {
  for (const port of [80, 443, 0, 65536, 4174.5]) {
    await assert.rejects(
      createCornhillHttpsServer({ ...validBase, port }),
      /port must be/
    );
  }
});
test("HTTPS server accepts only an exact HTTPS origin", async () => {
  for (const expectedOrigin of ["http://cornhill.local", "https://cornhill.local/app", "https://cornhill.local?x=1"]) {
    await assert.rejects(
      createCornhillHttpsServer({ ...validBase, expectedOrigin }),
      /exact HTTPS origin/
    );
  }
});
test("TLS files must use absolute paths outside the source repository", async () => {
  await assert.rejects(
    createCornhillHttpsServer({
      ...validBase,
      keyPath: resolve("local-server", "tls", "private.key")
    }),
    /outside the source repository/
  );
  await assert.rejects(
    createCornhillHttpsServer({
      ...validBase,
      certPath: resolve("local-server", "tls", "certificate.crt")
    }),
    /outside the source repository/
  );
});
