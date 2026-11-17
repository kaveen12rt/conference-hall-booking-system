import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/app/app.js";

describe("API foundation", () => {
  let server;
  let baseUrl;
  let databaseAvailable;
  let queries;

  before(async () => {
    databaseAvailable = false;
    queries = [];
    const database = {
      query: async (sql) => {
        queries.push(sql);
        if (!databaseAvailable) {
          throw new Error("Database unavailable");
        }
        return { rows: [{ "?column?": 1 }] };
      },
    };
    server = createApp({ database }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("reports unavailable when the database query fails", async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: "unavailable",
      database: "disconnected",
    });
    assert.deepEqual(queries, ["SELECT 1"]);
  });

  it("reports ready after a successful database query", async () => {
    databaseAvailable = true;
    const response = await fetch(`${baseUrl}/api/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      database: "connected",
    });
  });

  it("returns a consistent not-found response", async () => {
    const response = await fetch(`${baseUrl}/api/unknown`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { code: "NOT_FOUND" },
    });
  });

  it("rejects malformed JSON with a client error", async () => {
    const response = await fetch(`${baseUrl}/api/unknown`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: { code: "INVALID_JSON" },
    });
  });

  it("sets security headers", async () => {
    const response = await fetch(`${baseUrl}/api/unknown`);

    assert.equal(response.headers.get("x-powered-by"), null);
    assert.ok(response.headers.get("content-security-policy"));
  });
});
