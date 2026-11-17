import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createApp } from "./app/app.js";
import { createDatabasePool } from "./config/database.js";
import { loadConfig } from "./config/env.js";
import nodemailer from "nodemailer";
import { startEmailNotificationWorker } from "./notifications/email-worker.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const config = loadConfig();
const database = createDatabasePool(config.databaseUrl);
const app = createApp({
  database,
  frontendOrigin: config.frontendOrigin,
  authTokenSecret: config.authTokenSecret,
  secureCookies: process.env.NODE_ENV === "production",
  adminNotificationEmail: config.adminNotificationEmail,
  emailDeliveryConfigured: Boolean(config.emailNotifications),
});

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

let stopEmailWorker = () => {};
if (config.emailNotifications) {
  const { host, port, secure, username, password, from } = config.emailNotifications;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: username, pass: password },
  });
  stopEmailWorker = startEmailNotificationWorker({
    database,
    transporter,
    from,
  });
  if (!config.emailNotifications.adminEmail) {
    console.warn("Admin booking email alerts are disabled: set ADMIN_NOTIFICATION_EMAIL.");
  }
} else {
  console.warn("Email notifications are queued but disabled until SMTP settings are configured.");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopEmailWorker();
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
