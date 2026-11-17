export function loadConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  const databaseUrl = env.DATABASE_URL;
  const frontendOrigin = env.FRONTEND_ORIGIN ?? "http://127.0.0.1:5173";

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

  return { port, databaseUrl, frontendOrigin };
}
