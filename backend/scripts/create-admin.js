import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { createDatabasePool } from "../src/config/database.js";
import { loadConfig } from "../src/config/env.js";
import { isValidPassword } from "../src/routes/admin-auth.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

function promptHidden(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Admin setup requires an interactive terminal or ADMIN_EMAIL and ADMIN_PASSWORD in .env.");
  }

  stdout.write(label);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";

    function finish(error) {
      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }
      stdin.pause();
      stdin.removeListener("data", onData);
      stdin.removeListener("end", onEnd);
      stdout.write("\n");
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }

    function onData(chunk) {
      for (const character of chunk) {
        if (character === "\u0003" || character === "\u0004") {
          finish(new Error("Admin setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    }

    function onEnd() {
      finish(new Error("Admin setup input ended unexpectedly."));
    }

    stdin.on("data", onData);
    stdin.once("end", onEnd);
  });
}

function deriveUsername(emailOrUsername) {
  const local = emailOrUsername.includes("@")
    ? emailOrUsername.split("@")[0]
    : emailOrUsername;
  const cleaned = local.toLowerCase().replace(/[^a-z0-9._-]/g, "").replace(/^[^a-z0-9]+/, "");
  return cleaned.length >= 3 ? cleaned.slice(0, 32) : `admin_${randomUUID().slice(0, 8)}`;
}

const config = loadConfig();
const database = createDatabasePool(config.db);
const terminal = stdin.isTTY ? readline.createInterface({ input: stdin, output: stdout }) : null;

try {
  let email = config.adminSeed?.email || "";
  let username = email ? deriveUsername(email) : "";
  let password = config.adminSeed?.password || "";
  const fullName = config.adminSeed?.name || "";
  const ministryId = Number.isInteger(config.adminSeed?.ministryId)
    ? config.adminSeed.ministryId
    : null;

  if (!email || !password) {
    if (!terminal) {
      throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env or run in an interactive terminal.");
    }
    username = (await terminal.question("Admin username: ")).trim().toLowerCase();
    if (
      username.length < 3 ||
      username.length > 32 ||
      !/^[a-z0-9][a-z0-9._-]*$/.test(username)
    ) {
      throw new Error("Use 3-32 letters, numbers, dots, underscores, or hyphens; start with a letter or number.");
    }
    email = (await terminal.question("Admin email (optional): ")).trim().toLowerCase();
    terminal.close();
    password = await promptHidden("Admin password (12-72 UTF-8 bytes): ");
  }

  if (!isValidPassword(password)) {
    throw new Error("Password must be at least 12 characters and no more than 72 UTF-8 bytes.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await database.query(
    `SELECT id, username, email
     FROM admins
     WHERE LOWER(username) = LOWER($1)
        OR ($2 <> '' AND LOWER(email) = LOWER($2))
     LIMIT 1`,
    [username, email],
  );

  if (existing.rows[0]) {
    await database.query(
      `UPDATE admins
       SET email = COALESCE(NULLIF($1, ''), email),
           full_name = CASE WHEN $2 <> '' THEN $2 ELSE full_name END,
           ministry_id = COALESCE($3, ministry_id),
           password_hash = $4,
           is_active = TRUE
       WHERE id = $5`,
      [email, fullName, ministryId, passwordHash, existing.rows[0].id],
    );
    console.info(`Admin account synchronized for ${existing.rows[0].username} (${email || existing.rows[0].email}).`);
  } else {
    const id = randomUUID();
    await database.query(
      `INSERT INTO admins (id, username, email, full_name, ministry_id, password_hash)
       VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6)`,
      [id, username, email, fullName, ministryId, passwordHash],
    );
    console.info(`Admin account created for ${username} (${email || "no email"}).`);
  }
} catch (error) {
  console.error("Could not create admin account:", error.message);
  process.exitCode = 1;
} finally {
  terminal?.close();
  await database.end();
}
