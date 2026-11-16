import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const PUBLIC_DIR = new URL("../public/", import.meta.url);
const files = (await readdir(PUBLIC_DIR, { withFileTypes: true }))
  .filter(entry => entry.isFile() && /\.(?:html|js|css)$/i.test(entry.name));

test("local workspace assets do not depend on hosted Supabase or remote runtime scripts", async () => {
  assert.ok(files.length > 0, "local public workspace assets must exist");
  const violations = [];
  for (const entry of files) {
    const source = await readFile(new URL(entry.name, PUBLIC_DIR), "utf8");
    const checks = [
      ["hosted Supabase URL", /https?:\/\/[a-z0-9.-]+\.supabase\.co\b/i],
      ["Supabase browser SDK", /@supabase\/supabase-js/i],
      ["remote script source", /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//i],
      ["remote module import", /(?:from\s*|import\s*\()\s*["']https?:\/\//i],
      ["remote fetch endpoint", /fetch\s*\(\s*["']https?:\/\//i],
      ["remote WebSocket endpoint", /new\s+WebSocket\s*\(\s*["']wss?:\/\//i],
      ["remote EventSource endpoint", /new\s+EventSource\s*\(\s*["']https?:\/\//i],
      ["remote XMLHttpRequest endpoint", /\.open\s*\(\s*["'](?:GET|POST|PUT|PATCH|DELETE)["']\s*,\s*["']https?:\/\//i],
      ["remote worker import", /importScripts\s*\(\s*["']https?:\/\//i],
      ["remote CSS import", /@import\s+(?:url\()?\s*["']?https?:\/\//i]
    ];
    for (const [label, pattern] of checks) {
      if (pattern.test(source)) violations.push(entry.name + ": " + label);
    }
  }
  assert.deepEqual(violations, [], "local workspaces must use the local authenticated API and locally served runtime assets");
});
