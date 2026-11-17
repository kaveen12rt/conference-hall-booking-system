import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createRequireAdmin } from "../middleware/admin-auth.js";
import { createAdminCalendarRouter } from "../routes/admin-calendar.js";
import { createAdminAuthRouter } from "../routes/admin-auth.js";
import { createAdminHallsRouter } from "../routes/admin-halls.js";
import { createPublicBookingRouter } from "../routes/public-bookings.js";

export function createApp({
  database,
  authTokenSecret,
  frontendOrigin = "http://127.0.0.1:5173",
  secureCookies = false,
  adminNotificationEmail = "",
  emailDeliveryConfigured = false,
}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "10kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skip: (request) => request.method === "GET" && request.path === "/health",
      handler: (_request, response) => {
        response.status(429).json({ error: { code: "RATE_LIMIT_EXCEEDED" } });
      },
    }),
  );

  app.get("/api/health", async (_request, response) => {
    try {
      await database.query("SELECT 1");
      response.status(200).json({ status: "ok", database: "connected" });
    } catch {
      response.status(503).json({
        status: "unavailable",
        database: "disconnected",
      });
    }
  });

  app.use(
    createAdminAuthRouter({
      database,
      authTokenSecret,
      frontendOrigin,
      secureCookies,
    }),
  );
  app.use(
    createPublicBookingRouter({
      database,
      adminNotificationEmail,
      emailDeliveryConfigured,
    }),
  );
  app.use("/api/admin", createRequireAdmin(database, authTokenSecret));
  app.use(createAdminHallsRouter({ database, frontendOrigin }));
  app.use(createAdminCalendarRouter({ database, frontendOrigin }));

  app.use((_request, response) => {
    response.status(404).json({ error: { code: "NOT_FOUND" } });
  });

  app.use((error, _request, response, _next) => {
    if (error.type === "entity.parse.failed") {
      return response.status(400).json({ error: { code: "INVALID_JSON" } });
    }

    if (error.type === "entity.too.large") {
      return response.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE" } });
    }

    console.error("Unhandled request error:", error);
    response.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR" } });
  });

  return app;
}
