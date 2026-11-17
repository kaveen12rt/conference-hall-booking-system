import dotenv from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabasePool } from "../src/config/database.js";
import { loadConfig } from "../src/config/env.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const config = loadConfig();
const database = createDatabasePool(config.databaseUrl);
const migrationsDirectory = fileURLToPath(
  new URL("../../database/migrations/", import.meta.url),
);

try {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
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
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.info(`Applied migration ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await database.end();
}
