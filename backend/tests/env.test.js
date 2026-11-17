import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config/env.js";

describe("environment configuration", () => {
  it("loads valid settings", () => {
    assert.deepEqual(
      loadConfig({
        PORT: "4100",
        DATABASE_URL:
          "postgresql://conference_app:dev_only_change_me@127.0.0.1:5432/conference_hall_booking",
        FRONTEND_ORIGIN: "http://127.0.0.1:5173",
      }),
      {
        port: 4100,
        databaseUrl:
          "postgresql://conference_app:dev_only_change_me@127.0.0.1:5432/conference_hall_booking",
        frontendOrigin: "http://127.0.0.1:5173",
      },
    );
  });

  it("rejects a missing database URL", () => {
    assert.throws(() => loadConfig({}), /DATABASE_URL is required/);
  });

  it("rejects invalid ports", () => {
    assert.throws(
      () =>
        loadConfig({
          PORT: "70000",
          DATABASE_URL: "postgresql://localhost/db",
        }),
      /PORT must be an integer/,
    );
  });

  it("rejects non-PostgreSQL connection URLs", () => {
    assert.throws(
      () => loadConfig({ DATABASE_URL: "https://example.test/database" }),
      /postgres:\/\/ or postgresql:\/\//,
    );
  });

  it("rejects PostgreSQL URLs without a database name", () => {
    assert.throws(
      () => loadConfig({ DATABASE_URL: "postgresql://localhost" }),
      /host and database name/,
    );
  });

  it("rejects frontend URLs containing a path", () => {
    assert.throws(
      () =>
        loadConfig({
          DATABASE_URL: "postgresql://localhost/db",
          FRONTEND_ORIGIN: "https://example.test/app",
        }),
      /HTTP\(S\) origin without a path/,
    );
  });
});
