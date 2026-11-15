import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { readLocalRuntimeDatabaseConfig } from "../src/db/runtime-config.mjs";
import { createPostgresAuthRepositories } from "../src/db/auth-repositories.mjs";
import { createArgon2PasswordHasher } from "../src/security/argon2-password-hasher.mjs";

function askLine(prompt) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, value => { rl.close(); resolve(value.trim()); });
    rl.on("SIGINT", () => { rl.close(); reject(new Error("Check cancelled.")); });
  });
}

function askHidden(prompt) {
  const input = process.stdin, output = process.stdout;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return Promise.reject(new Error("Password entry requires an interactive terminal."));
  }
  output.write(prompt); input.setRawMode(true); input.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = error => {
      input.off("data", onData); input.setRawMode(false); input.pause(); output.write("\n");
      if (error) reject(error); else resolve(value);
    };
    const onData = chunk => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") return finish(new Error("Check cancelled."));
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u007f" || char === "\b") { value = value.slice(0, -1); output.write("\b \b"); }
        else if (char >= " " && char !== "\u007f") { value += char; output.write("*"); }
      }
    };
    input.on("data", onData);
  });
}

export async function runDirectorRuntimeCredentialCheck() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run this check from an interactive PowerShell or terminal window.");
  }
  console.log("\nCORNHILL — Director runtime credential diagnostic");
  console.log("Uses the same restricted database role as the live login service.");
  console.log("Does not create a login attempt, session, or audit event. Password stays local.\n");
  const username = await askLine("Director username: ");
  const normalized = username.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  if (normalized.length < 3 || normalized.length > 120) throw new Error("Username is invalid.");

  const pool = new Pool(readLocalRuntimeDatabaseConfig(process.env));
  try {
    const identity = await pool.query("SELECT current_user AS db_user, current_database() AS db_name");
    console.log("Runtime database identity: " +
      (identity.rows[0]?.db_user === "cornhill_auth_api" && identity.rows[0]?.db_name === "cornhill_local" ? "PASS" : "FAIL"));
    const repositories = createPostgresAuthRepositories(pool);
    const account = await repositories.accountRepository.findStaffByUsername(normalized);
    console.log("Account lookup through live-login repository: " + (account ? "FOUND" : "NOT FOUND"));
    if (!account) return;
    const role = Array.isArray(account.roles) && account.roles.includes("director");
    console.log("Account active: " + (account.accountStatus === "active" ? "YES" : "NO"));
    console.log("Director role assigned: " + (role ? "YES" : "NO"));
    const hasher = await createArgon2PasswordHasher();
    const validHash = hasher.isArgon2idHash(account.passwordHash);
    console.log("Runtime-visible Argon2id hash valid: " + (validHash ? "YES" : "NO"));
    if (!validHash) return;
    const password = await askHidden("Enter Director password to verify (hidden): ");
    console.log("Password matches runtime-visible hash: " + (await hasher.verify(account.passwordHash, password) ? "YES" : "NO"));
    console.log("No login attempt, session, or audit event was created.");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDirectorRuntimeCredentialCheck().catch(error => {
    console.error("\nDirector runtime diagnostic stopped: " + error.message);
    process.exitCode = 1;
  });
}
