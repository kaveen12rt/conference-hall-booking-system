import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { createDatabasePool } from "../src/config/database.js";
import { loadConfig } from "../src/config/env.js";
import { isValidPassword } from "../src/routes/admin-auth.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

function promptHidden(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Admin setup requires an interactive terminal.");
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

const config = loadConfig();
const database = createDatabasePool(config.databaseUrl);
const terminal = readline.createInterface({ input: stdin, output: stdout });

try {
  const username = (await terminal.question("Admin username: ")).trim().toLowerCase();
  if (
    username.length < 3 ||
    username.length > 32 ||
    !/^[a-z0-9][a-z0-9._-]*$/.test(username)
  ) {
    throw new Error("Use 3-32 letters, numbers, dots, underscores, or hyphens; start with a letter or number.");
  }

  terminal.close();
  const password = await promptHidden("Admin password (12-72 UTF-8 bytes): ");
  if (!isValidPassword(password)) {
    throw new Error("Password must be at least 12 characters and no more than 72 UTF-8 bytes.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await database.query(
    `INSERT INTO admins (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (LOWER(username)) DO NOTHING
     RETURNING username`,
    [username, passwordHash],
  );
  if (!result.rows[0]) {
    throw new Error("That admin username is already in use.");
  }
  console.info(`Admin account created for ${result.rows[0].username}.`);
} catch (error) {
  console.error("Could not create admin account:", error.message);
  process.exitCode = 1;
} finally {
  terminal.close();
  await database.end();
}
