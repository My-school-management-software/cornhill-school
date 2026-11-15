import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { readLocalDatabaseConfig } from "../src/db/config.mjs";
import { createArgon2PasswordHasher } from "../src/security/argon2-password-hasher.mjs";
import { bootstrapDirectorAccount } from "../src/security/director-bootstrap.mjs";

function ask(prompt) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, value => { rl.close(); resolve(value.trim()); });
    rl.on("SIGINT", () => { rl.close(); reject(new Error("Director setup cancelled.")); });
  });
}

function askHidden(prompt) {
  const input = process.stdin;
  const output = process.stdout;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return Promise.reject(new Error("Password entry requires an interactive terminal."));
  }
  output.write(prompt);
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = error => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = chunk => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") return finish(new Error("Director setup cancelled."));
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          output.write("\b \b");
        } else if (char >= " " && char !== "\u007f") {
          value += char;
          output.write("*");
        }
      }
    };
    input.on("data", onData);
  });
}

export async function runDirectorSetup() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run this one-time setup from an interactive PowerShell or terminal window.");
  }
  console.log("\nCORNHILL — one-time first Director setup");
  console.log("This creates the first Director account and initial Director permissions.");
  console.log("It will stop without changing data if a Director or any role permission grants already exist.\n");

  const username = await ask("Director username: ");
  const legalName = await ask("Director full legal name: ");
  const staffNumber = await ask("Director staff number (e.g. DIR-001): ");
  const emailInput = await ask("Email address (optional, press Enter to skip): ");
  const password = await askHidden("Choose password (14–128 characters; hidden): ");
  const confirmation = await askHidden("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  if (password.length < 14 || password.toLowerCase().includes(username.toLowerCase())) {
    throw new Error("Use at least 14 characters and do not include the username.");
  }

  const pool = new Pool(readLocalDatabaseConfig(process.env));
  try {
    const hasher = await createArgon2PasswordHasher();
    const result = await bootstrapDirectorAccount({
      pool, passwordHasher: hasher, username, legalName, staffNumber,
      email: emailInput || null, password
    });
    console.log("\nDirector account created successfully.");
    console.log("Username: " + result.username);
    console.log("Staff number: " + result.staffNumber);
    console.log("Initial Director permissions: " + result.permissionCount);
    console.log("Keep the password private. It was not written to the console or audit log.");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDirectorSetup().catch(error => {
    console.error("\nDirector setup stopped: " + error.message);
    process.exitCode = 1;
  });
}
