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
        AUTH_TOKEN_SECRET: "test-secret-with-more-than-thirty-two-bytes",
      }),
      {
        port: 4100,
        databaseUrl:
          "postgresql://conference_app:dev_only_change_me@127.0.0.1:5432/conference_hall_booking",
        frontendOrigin: "http://127.0.0.1:5173",
        authTokenSecret: "test-secret-with-more-than-thirty-two-bytes",
        emailNotifications: null,
        adminNotificationEmail: "",
      },
    );
  });

  it("loads optional SMTP settings for email notifications", () => {
    const config = loadConfig({
      DATABASE_URL: "postgresql://localhost/db",
      AUTH_TOKEN_SECRET: "test-secret-with-more-than-thirty-two-bytes",
      NOTIFICATION_SMTP_HOST: "smtp.example.test",
      NOTIFICATION_SMTP_PORT: "465",
      NOTIFICATION_SMTP_USER: "mailer",
      NOTIFICATION_SMTP_PASSWORD: "test-password",
      NOTIFICATION_FROM_EMAIL: "booking@example.test",
    });

    assert.deepEqual(config.emailNotifications, {
      host: "smtp.example.test",
      port: 465,
      secure: true,
      username: "mailer",
      password: "test-password",
      from: "booking@example.test",
      adminEmail: "",
    });
    assert.equal(config.adminNotificationEmail, "");
  });

  it("accepts an admin inbox before SMTP is configured", () => {
    const config = loadConfig({
      DATABASE_URL: "postgresql://localhost/db",
      AUTH_TOKEN_SECRET: "test-secret-with-more-than-thirty-two-bytes",
      ADMIN_NOTIFICATION_EMAIL: "office@example.test",
    });

    assert.equal(config.emailNotifications, null);
    assert.equal(config.adminNotificationEmail, "office@example.test");
  });

  it("rejects partial SMTP settings", () => {
    assert.throws(
      () =>
        loadConfig({
          DATABASE_URL: "postgresql://localhost/db",
          AUTH_TOKEN_SECRET: "test-secret-with-more-than-thirty-two-bytes",
          NOTIFICATION_SMTP_HOST: "smtp.example.test",
        }),
      /Configure all NOTIFICATION_SMTP_/,
    );
  });

  it("rejects a missing database URL", () => {
    assert.throws(() => loadConfig({}), /DATABASE_URL is required/);
  });

  it("rejects a missing or weak authentication secret", () => {
    assert.throws(
      () =>
        loadConfig({
          DATABASE_URL: "postgresql://localhost/db",
          AUTH_TOKEN_SECRET: "too-short",
        }),
      /AUTH_TOKEN_SECRET must contain at least 32 bytes/,
    );
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
