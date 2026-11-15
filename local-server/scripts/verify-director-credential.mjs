import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { readLocalDatabaseConfig } from "../src/db/config.mjs";
import { createArgon2PasswordHasher } from "../src/security/argon2-password-hasher.mjs";

function askLine(prompt) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, value => {
      rl.close();
      resolve(value.trim());
    });
    rl.on("SIGINT", () => {
      rl.close();
      reject(new Error("Credential check cancelled."));
    });
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
        if (char === "\u0003") return finish(new Error("Credential check cancelled."));
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

export async function runDirectorCredentialCheck() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run this check from an interactive PowerShell or terminal window.");
  }

  console.log("\nCORNHILL — private Director credential check");
  console.log("The password is entered locally and is never displayed, stored, or sent to ChatGPT.");
  console.log("This check does not create a login session or consume a sign-in attempt.\n");

  const username = await askLine("Director username: ");
  const normalizedUsername = username.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  if (normalizedUsername.length < 3 || normalizedUsername.length > 120) {
    throw new Error("Director username is invalid.");
  }

  const pool = new Pool(readLocalDatabaseConfig(process.env));
  try {
    const result = await pool.query(`
      SELECT id::text AS id, username, account_status, password_hash
      FROM cornhill_auth.staff_accounts
      WHERE username_normalized = $1
      LIMIT 1
    `, [normalizedUsername]);

    if (result.rows.length === 0) {
      console.log("Account lookup: NOT FOUND");
      return;
    }

    const account = result.rows[0];
    const roleResult = await pool.query(`
      SELECT 1
      FROM cornhill_auth.staff_role_assignments
      WHERE staff_account_id = $1::uuid AND role_code = 'director'
      LIMIT 1
    `, [account.id]);

    const hasher = await createArgon2PasswordHasher();
    const hashPolicyValid = hasher.isArgon2idHash(account.password_hash);
    const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account.id ?? "");

    console.log("Account lookup: FOUND");
    console.log("Stored username matches: " + (account.username === username.trim() ? "yes" : "normalised"));
    console.log("Account status active: " + (account.account_status === "active" ? "yes" : "no"));
    console.log("Director role assigned: " + (roleResult.rowCount === 1 ? "yes" : "no"));
    console.log("Account ID valid: " + (validId ? "yes" : "no"));
    console.log("Argon2id hash policy valid: " + (hashPolicyValid ? "yes" : "no"));

    if (!hashPolicyValid) {
      console.log("Password match: NOT CHECKED (stored hash does not meet the configured policy).");
      return;
    }

    const password = await askHidden("Enter the Director password to verify (hidden): ");
    const matches = await hasher.verify(account.password_hash, password);
    console.log("Password matches stored hash: " + (matches ? "YES" : "NO"));
    console.log("No authentication attempt, session, or audit login event was created.");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDirectorCredentialCheck().catch(error => {
    console.error("\nDirector credential check stopped: " + error.message);
    process.exitCode = 1;
  });
}
