import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["src", "scripts", "public", "test"];
const sourceFiles = [];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.isFile() && /\\.(?:mjs|js)$/i.test(entry.name)) sourceFiles.push(fullPath);
  }
}

for (const directory of sourceRoots) collect(join(root, directory));
sourceFiles.sort();

function run(label, args) {
  console.log("\\n== " + label + " ==");
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env
  });
  if (result.error) {
    console.error(label + " could not start:", result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(label + " failed with exit code " + result.status);
    process.exit(result.status ?? 1);
  }
}

console.log("CORNHILL local release verification");
console.log("Checking " + sourceFiles.length + " JavaScript source files.");
for (const file of sourceFiles) {
  const relative = file.slice(root.length + 1);
  run("Syntax: " + relative, ["--check", file]);
}
run("Complete automated test suite", ["--test"]);
console.log("\\nPASS: source syntax checks and the complete automated test suite finished successfully.");
