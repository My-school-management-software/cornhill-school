import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateTransfer, transferDigest } from "./import-learner-transfer.mjs";

function unwrap(value) {
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error("Expected exactly one exported SQL result row.");
    value = value[0];
  }
  if (value && typeof value === "object" && value.transfer_payload) value = value.transfer_payload;
  if (typeof value === "string") value = JSON.parse(value);
  return value;
}
async function main() {
  const args = process.argv.slice(2);
  const inputAt = args.indexOf("--input"), outputAt = args.indexOf("--output");
  if (inputAt < 0 || outputAt < 0 || !args[inputAt + 1] || !args[outputAt + 1]) {
    throw new Error("Usage: npm run seal:learners -- --input <raw-export.json> --output <sealed-transfer.json>");
  }
  const raw = JSON.parse(await readFile(resolve(args[inputAt + 1]), "utf8"));
  const value = unwrap(raw);
  if (!value || value.format !== "cornhill-learner-transfer" || value.version !== 1) {
    throw new Error("Input is not the expected CORNHILL SQL export.");
  }
  const { digest: ignored, ...payload } = value;
  const sealed = { ...payload, digest: transferDigest(payload) };
  const summary = validateTransfer(sealed);
  await writeFile(resolve(args[outputAt + 1]), JSON.stringify(sealed, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  console.log("SEALED TRANSFER PACKAGE CREATED. No database was accessed or changed.");
  console.log(JSON.stringify(summary));
  console.log("Output file was created only if it did not already exist.");
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error("Sealing stopped:", error.message); process.exitCode = 1; });
}
