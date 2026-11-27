const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseFromHeader(rawValue) {
  const trimmed = String(rawValue ?? "").trim();
  const angleMatch = /^(?:"?([^"]*?)"?\s*)?<([^\s@]+@[^\s@]+\.[^\s@]+)>$/.exec(trimmed);
  if (angleMatch) {
    return {
      name: angleMatch[1].trim(),
      address: angleMatch[2].trim(),
    };
  }
  if (VALID_EMAIL.test(trimmed)) {
    return { name: "", address: trimmed };
  }
  return null;
}

function parseFrontendOrigins(rawValue) {
  const raw = rawValue ?? "http://localhost:5173";
  const entries = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new Error("FRONTEND_URL must contain at least one valid origin.");
  }

  return entries.map((origin) => {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("FRONTEND_ORIGIN must be a valid URL.");
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error("FRONTEND_ORIGIN must be an HTTP(S) origin without a path.");
    }
    return origin;
  });
}

function parseDatabaseConfig(env) {
  if (env.DATABASE_URL) {
    let parsed;
    try {
      parsed = new URL(env.DATABASE_URL);
    } catch {
      throw new Error("DATABASE_URL must be a valid MySQL connection URL.");
    }
    if (
      parsed.protocol !== "mysql:" ||
      !parsed.hostname ||
      parsed.pathname.length < 2
    ) {
      throw new Error(
        "DATABASE_URL must use mysql:// and include a host and database name.",
      );
    }
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.slice(1),
      sslCa: env.DB_SSL_CA ?? "",
    };
  }

  const host = env.DB_HOST?.trim();
  const user = env.DB_USER?.trim();
  const database = env.DB_NAME?.trim();
  const port = Number(env.DB_PORT ?? 3306);

  if (!host || !user || !database) {
    throw new Error("DB_HOST, DB_USER, and DB_NAME are required.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT must be an integer between 1 and 65535.");
  }

  return {
    host,
    port,
    user,
    password: env.DB_PASSWORD ?? "",
    database,
    sslCa: env.DB_SSL_CA ?? "",
  };
}

export function loadConfig(env = process.env) {
  const port = Number(env.PORT ?? 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const db = parseDatabaseConfig(env);
  const frontendOrigins = parseFrontendOrigins(env.FRONTEND_URL ?? env.FRONTEND_ORIGIN);
  const frontendOrigin = frontendOrigins[0];
  const authTokenSecret = env.JWT_SECRET ?? env.AUTH_TOKEN_SECRET;

  if (!authTokenSecret || Buffer.byteLength(authTokenSecret, "utf8") < 32) {
    throw new Error("JWT_SECRET / AUTH_TOKEN_SECRET must contain at least 32 bytes.");
  }

  const jwtExpiresIn = (env.JWT_EXPIRES_IN ?? "8h").trim() || "8h";

  const adminNotificationEmail =
    (env.ADMIN_NOTIFICATION_EMAIL ?? env.ADMIN_EMAIL ?? "").trim();
  if (adminNotificationEmail && !VALID_EMAIL.test(adminNotificationEmail)) {
    throw new Error("ADMIN_NOTIFICATION_EMAIL must be a valid email address.");
  }

  const smtpHost = env.SMTP_HOST ?? env.NOTIFICATION_SMTP_HOST;
  const smtpPortRaw = env.SMTP_PORT ?? env.NOTIFICATION_SMTP_PORT;
  const smtpSecureRaw = env.SMTP_SECURE ?? env.NOTIFICATION_SMTP_SECURE;
  const smtpUser = env.SMTP_USER ?? env.NOTIFICATION_SMTP_USER;
  const smtpPassword = env.SMTP_PASSWORD ?? env.NOTIFICATION_SMTP_PASSWORD;
  const smtpFromRaw = env.SMTP_FROM ?? env.NOTIFICATION_FROM_EMAIL;

  const mailValues = [smtpHost, smtpPortRaw, smtpUser, smtpPassword, smtpFromRaw];
  const configuredCount = mailValues.filter(Boolean).length;
  let emailNotifications = null;

  if (configuredCount > 0) {
    if (configuredCount !== mailValues.length) {
      throw new Error(
        "Configure all SMTP_* / NOTIFICATION_SMTP_* settings and SMTP_FROM to enable email notifications.",
      );
    }

    const smtpPort = Number(smtpPortRaw);
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      throw new Error("SMTP_PORT must be a valid port.");
    }
    const parsedFrom = parseFromHeader(smtpFromRaw);
    if (!parsedFrom) {
      throw new Error("SMTP_FROM / NOTIFICATION_FROM_EMAIL must be a valid email address.");
    }

    emailNotifications = {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecureRaw === "true" || smtpPort === 465,
      username: smtpUser,
      password: smtpPassword,
      from: parsedFrom.address,
      fromName: parsedFrom.name,
      adminEmail: adminNotificationEmail,
    };
  }

  return {
    port,
    db,
    frontendOrigin,
    frontendOrigins,
    authTokenSecret,
    jwtExpiresIn,
    emailNotifications,
    adminNotificationEmail,
    adminSeed: env.ADMIN_EMAIL && env.ADMIN_PASSWORD
      ? {
          email: env.ADMIN_EMAIL.trim().toLowerCase(),
          password: env.ADMIN_PASSWORD,
          name: (env.ADMIN_NAME ?? "").trim(),
          ministryId: env.ADMIN_MINISTRY_ID ? Number(env.ADMIN_MINISTRY_ID) : null,
        }
      : null,
  };
}
