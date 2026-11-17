import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import { jwtVerify, SignJWT } from "jose";
import { createRequireAdmin } from "../middleware/admin-auth.js";

const COOKIE_NAME = "admin_session";
const COOKIE_MAX_AGE = 30 * 60 * 1000;
const TOKEN_ISSUER = "conference-hall-booking-system";
const PASSWORD_MIN_LENGTH = 12;

function isValidPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= PASSWORD_MIN_LENGTH &&
    Buffer.byteLength(password, "utf8") <= 72
  );
}

function cookieOptions(secureCookies) {
  return {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "strict",
    path: "/api/admin",
    maxAge: COOKIE_MAX_AGE,
  };
}

function clearCookieOptions(secureCookies) {
  const options = cookieOptions(secureCookies);
  delete options.maxAge;
  return options;
}

function createSameOriginGuard(frontendOrigin) {
  return (request, response, next) => {
    if (request.get("origin") !== frontendOrigin) {
      return response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED" } });
    }
    return next();
  };
}

export function createAdminAuthRouter({
  database,
  authTokenSecret,
  frontendOrigin,
  secureCookies,
}) {
  const router = express.Router();
  const key = new TextEncoder().encode(authTokenSecret);
  const requireAdmin = createRequireAdmin(database, authTokenSecret);
  const sameOrigin = createSameOriginGuard(frontendOrigin);
  const dummyPasswordHash = bcrypt.hashSync(randomBytes(32).toString("hex"), 12);
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({ error: { code: "LOGIN_RATE_LIMIT_EXCEEDED" } });
    },
  });

  async function issueSession(admin, response) {
    const token = await new SignJWT({ version: admin.token_version })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(TOKEN_ISSUER)
      .setSubject(admin.id)
      .setIssuedAt()
      .setExpirationTime("30m")
      .sign(key);

    response.cookie(COOKIE_NAME, token, cookieOptions(secureCookies));
  }

  router.post("/api/admin/auth/login", sameOrigin, loginLimiter, async (request, response) => {
    const username =
      typeof request.body?.username === "string"
        ? request.body.username.trim().toLowerCase()
        : "";
    const password = request.body?.password;

    if (
      username.length < 3 ||
      username.length > 32 ||
      !/^[a-z0-9][a-z0-9._-]*$/.test(username) ||
      typeof password !== "string" ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return response.status(400).json({ error: { code: "INVALID_CREDENTIALS" } });
    }

    const result = await database.query(
      `SELECT id, username, password_hash, token_version
       FROM admins
       WHERE LOWER(username) = LOWER($1) AND is_active = TRUE`,
      [username],
    );
    const admin = result.rows[0];
    const passwordMatches = await bcrypt.compare(
      password,
      admin?.password_hash ?? dummyPasswordHash,
    );

    if (!admin || !passwordMatches) {
      return response.status(401).json({ error: { code: "INVALID_CREDENTIALS" } });
    }

    await database.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id)
       VALUES ($1, 'admin.login', 'admin', $1)`,
      [admin.id],
    );
    await issueSession(admin, response);
    return response.status(200).json({ admin: { id: admin.id, username: admin.username } });
  });

  router.post("/api/admin/auth/logout", sameOrigin, async (request, response) => {
    const token = request.cookies?.[COOKIE_NAME];
    if (token) {
      let payload;
      try {
        ({ payload } = await jwtVerify(token, key, {
          algorithms: ["HS256"],
          issuer: TOKEN_ISSUER,
        }));
      } catch {
        payload = null;
      }

      if (payload?.sub && Number.isInteger(payload.version)) {
        const revoked = await database.query(
          `UPDATE admins
           SET token_version = token_version + 1, updated_at = NOW()
           WHERE id = $1 AND token_version = $2 AND is_active = TRUE
           RETURNING id`,
          [payload.sub, payload.version],
        );
        if (revoked.rows[0]) {
          await database.query(
            `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id)
             VALUES ($1, 'admin.logout', 'admin', $1)`,
            [payload.sub],
          );
        }
      }
    }

    response.clearCookie(COOKIE_NAME, clearCookieOptions(secureCookies));
    return response.status(204).end();
  });

  router.get("/api/admin/auth/me", requireAdmin, (request, response) => {
    response.json({ admin: { id: request.admin.id, username: request.admin.username } });
  });

  router.post(
    "/api/admin/auth/password",
    sameOrigin,
    requireAdmin,
    async (request, response) => {
      const { currentPassword, newPassword } = request.body ?? {};

      if (
        typeof currentPassword !== "string" ||
        Buffer.byteLength(currentPassword, "utf8") > 72 ||
        !isValidPassword(newPassword)
      ) {
        return response.status(400).json({ error: { code: "INVALID_PASSWORD" } });
      }

      const current = await database.query(
        "SELECT password_hash FROM admins WHERE id = $1 AND is_active = TRUE",
        [request.admin.id],
      );

      if (
        !current.rows[0] ||
        !(await bcrypt.compare(currentPassword, current.rows[0].password_hash))
      ) {
        return response.status(401).json({ error: { code: "CURRENT_PASSWORD_INVALID" } });
      }

      if (await bcrypt.compare(newPassword, current.rows[0].password_hash)) {
        return response.status(400).json({ error: { code: "PASSWORD_UNCHANGED" } });
      }

      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const updated = await client.query(
          `UPDATE admins
           SET password_hash = $1, token_version = token_version + 1, updated_at = NOW()
           WHERE id = $2 AND is_active = TRUE
           RETURNING id, username, token_version`,
          [await bcrypt.hash(newPassword, 12), request.admin.id],
        );
        const admin = updated.rows[0];

        if (!admin) {
          await client.query("ROLLBACK");
          return response.status(401).json({ error: { code: "ADMIN_AUTH_REQUIRED" } });
        }

        await client.query(
          `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id)
           VALUES ($1, 'admin.password_changed', 'admin', $1)`,
          [admin.id],
        );
        await client.query("COMMIT");
        await issueSession(admin, response);
        return response.status(200).json({ admin: { id: admin.id, username: admin.username } });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );

  return router;
}

export { isValidPassword };
