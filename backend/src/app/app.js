import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

export function createApp({
  database,
  frontendOrigin = "http://127.0.0.1:5173",
}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json({ limit: "10kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      standardHeaders: "draft-8",
      legacyHeaders: false,
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
