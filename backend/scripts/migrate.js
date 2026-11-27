import dotenv from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabasePool } from "../src/config/database.js";
import { loadConfig } from "../src/config/env.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const config = loadConfig();
const database = createDatabasePool(config.db, { multipleStatements: true });
const migrationsDirectory = fileURLToPath(
  new URL("../../database/migrations/", import.meta.url),
);

try {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort();

  for (const name of migrationNames) {
    const alreadyApplied = await database.query(
      "SELECT 1 FROM schema_migrations WHERE name = $1",
      [name],
    );

    if (alreadyApplied.rowCount > 0) {
      continue;
    }

    const sql = await readFile(join(migrationsDirectory, name), "utf8");
    const client = await database.connect();

    try {
      await client.exec(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      console.info(`Applied migration ${name}`);
    } finally {
      client.release();
    }
  }
} finally {
  await database.end();
}
