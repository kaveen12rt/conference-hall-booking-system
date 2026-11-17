import "dotenv/config";
import { createApp } from "./app/app.js";
import { createDatabasePool } from "./config/database.js";
import { loadConfig } from "./config/env.js";

const config = loadConfig();
const database = createDatabasePool(config.databaseUrl);
const app = createApp({ database, frontendOrigin: config.frontendOrigin });

try {
  await database.query("SELECT 1");
} catch (error) {
  console.error("Could not connect to PostgreSQL:", error.message);
  await database.end();
  process.exitCode = 1;
  throw error;
}

const server = app.listen(config.port, "127.0.0.1", () => {
  console.info(`API listening on http://127.0.0.1:${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(async (error) => {
      if (error) {
        console.error("Failed to close the HTTP server:", error);
        process.exitCode = 1;
      }

      try {
        await database.end();
      } catch (disconnectError) {
        console.error("Failed to close PostgreSQL pool:", disconnectError);
        process.exitCode = 1;
      }
    });
  });
}
