export function loadConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  const databaseUrl = env.DATABASE_URL;
  const frontendOrigin = env.FRONTEND_ORIGIN ?? "http://127.0.0.1:5173";
  const authTokenSecret = env.AUTH_TOKEN_SECRET;
  const mailSettings = [
    "NOTIFICATION_SMTP_HOST",
    "NOTIFICATION_SMTP_PORT",
    "NOTIFICATION_SMTP_USER",
    "NOTIFICATION_SMTP_PASSWORD",
    "NOTIFICATION_FROM_EMAIL",
  ];
  const configuredMailSettings = mailSettings.filter((key) => env[key]);
  let emailNotifications = null;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (
    !["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) ||
    !parsedDatabaseUrl.hostname ||
    parsedDatabaseUrl.pathname.length < 2
  ) {
    throw new Error(
      "DATABASE_URL must use postgres:// or postgresql:// and include a host and database name.",
    );
  }

  let parsedFrontendOrigin;
  try {
    parsedFrontendOrigin = new URL(frontendOrigin);
  } catch {
    throw new Error("FRONTEND_ORIGIN must be a valid URL.");
  }

  if (
    !["http:", "https:"].includes(parsedFrontendOrigin.protocol) ||
    parsedFrontendOrigin.origin !== frontendOrigin
  ) {
    throw new Error("FRONTEND_ORIGIN must be an HTTP(S) origin without a path.");
  }

  if (!authTokenSecret || Buffer.byteLength(authTokenSecret, "utf8") < 32) {
    throw new Error("AUTH_TOKEN_SECRET must contain at least 32 bytes.");
  }

  if (env.ADMIN_NOTIFICATION_EMAIL && !validEmail.test(env.ADMIN_NOTIFICATION_EMAIL)) {
    throw new Error("ADMIN_NOTIFICATION_EMAIL must be a valid email address.");
  }

  if (configuredMailSettings.length > 0) {
    if (configuredMailSettings.length !== mailSettings.length) {
      throw new Error(
        "Configure all NOTIFICATION_SMTP_* settings and NOTIFICATION_FROM_EMAIL to enable email notifications.",
      );
    }

    const smtpPort = Number(env.NOTIFICATION_SMTP_PORT);
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      throw new Error("NOTIFICATION_SMTP_PORT must be a valid port.");
    }
    if (!validEmail.test(env.NOTIFICATION_FROM_EMAIL)) {
      throw new Error("NOTIFICATION_FROM_EMAIL must be a valid email address.");
    }
    emailNotifications = {
      host: env.NOTIFICATION_SMTP_HOST,
      port: smtpPort,
      secure: env.NOTIFICATION_SMTP_SECURE === "true" || smtpPort === 465,
      username: env.NOTIFICATION_SMTP_USER,
      password: env.NOTIFICATION_SMTP_PASSWORD,
      from: env.NOTIFICATION_FROM_EMAIL,
      adminEmail: env.ADMIN_NOTIFICATION_EMAIL ?? "",
    };
  }

  return {
    port,
    databaseUrl,
    frontendOrigin,
    authTokenSecret,
    emailNotifications,
    adminNotificationEmail: env.ADMIN_NOTIFICATION_EMAIL ?? "",
  };
}
