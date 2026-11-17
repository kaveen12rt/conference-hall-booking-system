import { jwtVerify } from "jose";

const COOKIE_NAME = "admin_session";
const TOKEN_ISSUER = "conference-hall-booking-system";

export function createRequireAdmin(database, authTokenSecret) {
  const key = new TextEncoder().encode(authTokenSecret);

  return async (request, response, next) => {
    const token = request.cookies?.[COOKIE_NAME];
    if (!token) {
      return response.status(401).json({ error: { code: "ADMIN_AUTH_REQUIRED" } });
    }

    let payload;
    try {
      ({ payload } = await jwtVerify(token, key, {
        algorithms: ["HS256"],
        issuer: TOKEN_ISSUER,
      }));
    } catch {
      return response.status(401).json({ error: { code: "ADMIN_AUTH_REQUIRED" } });
    }

    if (!payload.sub || !Number.isInteger(payload.version)) {
      return response.status(401).json({ error: { code: "ADMIN_AUTH_REQUIRED" } });
    }

    const result = await database.query(
      `SELECT id, username, token_version
       FROM admins
       WHERE id = $1 AND is_active = TRUE`,
      [payload.sub],
    );
    const admin = result.rows[0];

    if (!admin || admin.token_version !== payload.version) {
      return response.status(401).json({ error: { code: "ADMIN_AUTH_REQUIRED" } });
    }

    request.admin = admin;
    return next();
  };
}
