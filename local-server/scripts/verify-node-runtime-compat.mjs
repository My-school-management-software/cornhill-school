// CORNHILL V36B — non-destructive Node runtime preflight.
// Avoid nested PowerShell/Windows shell quoting by reading process.version directly.
// This module does not import the app, read .env, or access the school database.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function parseNodeVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9a-zA-Z.-]+)?$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const numbers = match.slice(1, 4).map(Number);
  return numbers.every(Number.isSafeInteger) ? { major: numbers[0], minor: numbers[1], patch: numbers[2] } : null;
}

export function checkNodeEngine({ nodeVersion, engineRange }) {
  const parsed = parseNodeVersion(nodeVersion);
  if (!parsed) return { ok: false, code: 'INVALID_NODE_VERSION' };
  const range = String(engineRange ?? '').trim();
  // Accept the specific >=N[.N[.N]] pattern currently declared by CORNHILL.
  // Unfamiliar engine syntax fails closed rather than guessing.
  const m = /^(?:>=)(\d+)(?:\.(\d+)(?:\.(\d+))?)?$/.exec(range);
  if (!m) return { ok: false, code: 'UNRECOGNIZED_NODE_ENGINE_POLICY' };
  const floor = [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
  if (!floor.every(Number.isSafeInteger)) return { ok: false, code: 'UNRECOGNIZED_NODE_ENGINE_POLICY' };
  const current = [parsed.major, parsed.minor, parsed.patch];
  for (let i = 0; i < 3; i++) {
    if (current[i] > floor[i]) return { ok: true, code: 'SUPPORTED_BY_DECLARED_ENGINE', nodeMajor: parsed.major };
    if (current[i] < floor[i]) return { ok: false, code: 'NODE_BELOW_DECLARED_ENGINE', nodeMajor: parsed.major };
  }
  return { ok: true, code: 'SUPPORTED_BY_DECLARED_ENGINE', nodeMajor: parsed.major };
}

export function runPreflight(projectPackagePath) {
  const pkg = JSON.parse(readFileSync(projectPackagePath, 'utf8'));
  const result = checkNodeEngine({ nodeVersion: process.version, engineRange: pkg?.engines?.node });
  return { ...result, engineRange: pkg?.engines?.node ?? null, nodeVersion: process.version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const packagePath = process.argv[2] ? resolve(process.argv[2]) : resolve('package.json');
  try {
    const result = runPreflight(packagePath);
    process.stdout.write(`CORNHILL_NODE_VERSION=${result.nodeVersion}\n`);
    process.stdout.write(`CORNHILL_DECLARED_NODE_ENGINE=${result.engineRange}\n`);
    process.stdout.write(`CORNHILL_NODE_ENGINE_PREFLIGHT=${result.ok ? 'PASS' : 'BLOCKED'}\n`);
    process.stdout.write(`CORNHILL_NODE_ENGINE_REASON=${result.code}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch {
    process.stdout.write('CORNHILL_NODE_ENGINE_PREFLIGHT=BLOCKED\n');
    process.stdout.write('CORNHILL_NODE_ENGINE_REASON=PACKAGE_READ_OR_PARSE_FAILED\n');
    process.exitCode = 1;
  }
}
