import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config/env.js";

describe("environment configuration", () => {
  it("loads valid MySQL settings from DB_* and SMTP_* variables", () => {
    const config = loadConfig({
      PORT: "5000",
      DB_HOST: "mysql.example.test",
      DB_PORT: "20682",
      DB_USER: "avnadmin",
      DB_PASSWORD: "secret-password",
      DB_NAME: "conferenceBookingSystem",
      DB_SSL_CA: "certificates/ca.pem",
      FRONTEND_URL: "http://localhost:5173,http://localhost:5174",
      JWT_SECRET: "test-secret-with-more-than-thirty-two-bytes",
      JWT_EXPIRES_IN: "8h",
      ADMIN_EMAIL: "admin@example.gov.lk",
      ADMIN_PASSWORD: "ChangeMe@12345",
      ADMIN_NAME: "System Administrator",
      ADMIN_MINISTRY_ID: "1",
    });

    assert.equal(config.port, 5000);
    assert.deepEqual(config.db, {
      host: "mysql.example.test",
      port: 20682,
      user: "avnadmin",
      password: "secret-password",
      database: "conferenceBookingSystem",
      sslCa: "certificates/ca.pem",
    });
    assert.equal(config.frontendOrigin, "http://localhost:5173");
    assert.deepEqual(config.frontendOrigins, [
      "http://localhost:5173",
      "http://localhost:5174",
    ]);
    assert.equal(config.jwtExpiresIn, "8h");
    assert.equal(config.adminNotificationEmail, "admin@example.gov.lk");
    assert.equal(config.emailNotifications, null);
    assert.deepEqual(config.adminSeed, {
      email: "admin@example.gov.lk",
      password: "ChangeMe@12345",
      name: "System Administrator",
      ministryId: 1,
    });
  });

  it("loads optional SMTP settings for email notifications", () => {
    const config = loadConfig({
      DB_HOST: "mysql.example.test",
      DB_USER: "avnadmin",
      DB_NAME: "conferenceBookingSystem",
      JWT_SECRET: "test-secret-with-more-than-thirty-two-bytes",
      SMTP_HOST: "smtp.example.test",
      SMTP_PORT: "465",
      SMTP_USER: "mailer",
      SMTP_PASSWORD: "test-password",
      SMTP_FROM: '"Conference System" <booking@example.test>',
    });

    assert.deepEqual(config.emailNotifications, {
      host: "smtp.example.test",
      port: 465,
      secure: true,
      username: "mailer",
      password: "test-password",
      from: "booking@example.test",
      fromName: "Conference System",
      adminEmail: "",
    });
    assert.equal(config.adminNotificationEmail, "");
  });

  it("accepts an admin inbox before SMTP is configured", () => {
    const config = loadConfig({
      DATABASE_URL: "mysql://user:pass@localhost:3306/conferenceBookingSystem",
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
          DB_HOST: "localhost",
          DB_USER: "root",
          DB_NAME: "conferenceBookingSystem",
          JWT_SECRET: "test-secret-with-more-than-thirty-two-bytes",
          SMTP_HOST: "smtp.example.test",
        }),
      /Configure all SMTP_/,
    );
  });

  it("rejects missing database configuration", () => {
    assert.throws(() => loadConfig({}), /DB_HOST, DB_USER, and DB_NAME are required/);
  });

  it("rejects a missing or weak authentication secret", () => {
    assert.throws(
      () =>
        loadConfig({
          DB_HOST: "localhost",
          DB_USER: "root",
          DB_NAME: "conferenceBookingSystem",
          JWT_SECRET: "too-short",
        }),
      /JWT_SECRET \/ AUTH_TOKEN_SECRET must contain at least 32 bytes/,
    );
  });

  it("rejects invalid ports", () => {
    assert.throws(
      () =>
        loadConfig({
          PORT: "70000",
          DB_HOST: "localhost",
          DB_USER: "root",
          DB_NAME: "conferenceBookingSystem",
        }),
      /PORT must be an integer/,
    );
  });

  it("rejects non-MySQL connection URLs", () => {
    assert.throws(
      () => loadConfig({ DATABASE_URL: "https://example.test/database" }),
      /mysql:\/\//,
    );
  });

  it("rejects MySQL URLs without a database name", () => {
    assert.throws(
      () => loadConfig({ DATABASE_URL: "mysql://localhost" }),
      /host and database name/,
    );
  });

  it("rejects frontend URLs containing a path", () => {
    assert.throws(
      () =>
        loadConfig({
          DB_HOST: "localhost",
          DB_USER: "root",
          DB_NAME: "conferenceBookingSystem",
          FRONTEND_URL: "https://example.test/app",
        }),
      /HTTP\(S\) origin without a path/,
    );
  });
});
