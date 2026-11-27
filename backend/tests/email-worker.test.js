import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { processEmailNotifications } from "../src/notifications/email-worker.js";
import { encryptManageToken } from "../src/notifications/manage-token.js";

const authTokenSecret = "test-secret-with-more-than-thirty-two-bytes";

function createDatabase(notification) {
  const updates = [];
  const runQuery = async (sql, params = []) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rowCount: 0, rows: [] };
    }
    if (sql.includes("SELECT id") && sql.includes("FROM notifications")) {
      return { rowCount: 1, rows: [{ id: notification.id }] };
    }
    if (sql.includes("SELECT n.id")) {
      return { rowCount: 1, rows: [notification] };
    }
    if (sql.includes("UPDATE notifications")) {
      updates.push({ sql, params });
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  return {
    updates,
    query: runQuery,
    async connect() {
      return {
        query: runQuery,
        release() {},
      };
    },
  };
}

describe("email notification worker", () => {
  it("sends a queued notification and marks it sent", async () => {
    const database = createDatabase({
      id: "notification-id",
      event_type: "booking_received",
      recipient_email: "requester@example.test",
      attempts: 1,
      bookingStatus: "pending",
      meetingTitle: 'Planning <script>alert("x")</script>',
      contactName: "Example Requester",
      contactDesignation: "Senior <Officer>",
      contactEmail: "requester@example.test",
      date: "2026-12-01",
      startTime: "09:00",
      endTime: "10:00",
      hallName: "Main Hall",
    });
    const sent = [];
    await processEmailNotifications({
      database,
      from: "booking@example.test",
      transporter: { sendMail: async (message) => sent.push(message) },
      logger: { error: assert.fail },
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "requester@example.test");
    assert.match(sent[0].text, /Main Hall/);
    assert.match(sent[0].text, /Senior <Officer>/);
    assert.match(sent[0].subject, /^Conference Hall Booking \| /);
    assert.match(sent[0].html, /GOVERNMENT OF SRI LANKA/);
    assert.match(sent[0].html, /Booking details \/ වෙන්කිරීමේ විස්තර/);
    assert.match(sent[0].html, /cid:sri-lanka-state-emblem@conference-hall-booking/);
    assert.equal(sent[0].attachments[0].cid, "sri-lanka-state-emblem@conference-hall-booking");
    assert.equal(sent[0].attachments[0].contentType, "image/png");
    assert.equal(sent[0].attachments[0].contentDisposition, "inline");
    assert.match(sent[0].html, /Planning &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    assert.match(sent[0].html, /Senior &lt;Officer&gt;/);
    assert.doesNotMatch(sent[0].html, /<Officer>/);
    assert.doesNotMatch(sent[0].html, /<script>/);
    const emblem = await readFile(sent[0].attachments[0].path);
    assert.deepEqual([...emblem.subarray(0, 8)], [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    assert.equal(database.updates.at(-1).params[0], "notification-id");
    assert.match(database.updates.at(-1).sql, /delivery_status = 'sent'/);
  });

  it("adds a secure requester management link to the booking confirmation email", async () => {
    const manageToken = "A".repeat(43);
    const database = createDatabase({
      id: "notification-id",
      event_type: "booking_approved",
      recipient_email: "requester@example.test",
      attempts: 1,
      manage_token_encrypted: encryptManageToken(manageToken, authTokenSecret),
      bookingStatus: "approved",
      meetingTitle: "Planning meeting",
      contactName: "Example Requester",
      contactEmail: "requester@example.test",
      date: "2026-12-01",
      startTime: "09:00",
      endTime: "10:00",
      hallName: "Main Hall",
    });
    const sent = [];
    await processEmailNotifications({
      database,
      from: "booking@example.test",
      tokenEncryptionSecret: authTokenSecret,
      frontendOrigin: "https://booking.example.test",
      transporter: { sendMail: async (message) => sent.push(message) },
      logger: { error: assert.fail },
    });

    assert.match(sent[0].text, new RegExp(
      `https://booking\\.example\\.test/#manage=${manageToken}`,
    ));
    assert.match(sent[0].html, new RegExp(
      `href="https://booking\\.example\\.test/#manage=${manageToken}"`,
    ));
    assert.match(sent[0].html, /Manage booking \/ වෙන්කිරීම කළමනාකරණය/);
    assert.match(database.updates.at(-1).sql, /manage_token_encrypted = NULL/);
  });

  it("sends an admin notice when a booking is automatically confirmed", async () => {
    const database = createDatabase({
      id: "notification-id",
      event_type: "new_booking_confirmed",
      recipient_email: "office@example.test",
      attempts: 1,
      bookingStatus: "approved",
      meetingTitle: "Planning meeting",
      contactName: "Example Requester",
      contactEmail: "requester@example.test",
      date: "2026-12-01",
      startTime: "09:00",
      endTime: "10:00",
      hallName: "Main Hall",
    });
    const sent = [];
    await processEmailNotifications({
      database,
      from: "booking@example.test",
      transporter: { sendMail: async (message) => sent.push(message) },
      logger: { error: assert.fail },
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "office@example.test");
    assert.match(sent[0].text, /automatically confirmed/i);
    assert.match(sent[0].html, /automatically confirmed/i);
  });

  it("retries temporary SMTP failures and records the error", async () => {
    const database = createDatabase({
      id: "notification-id",
      event_type: "booking_received",
      recipient_email: "requester@example.test",
      attempts: 1,
      bookingStatus: "pending",
      meetingTitle: "Planning meeting",
      contactName: "Example Requester",
      contactEmail: "requester@example.test",
      date: "2026-12-01",
      startTime: "09:00",
      endTime: "10:00",
      hallName: "Main Hall",
    });
    await processEmailNotifications({
      database,
      from: "booking@example.test",
      transporter: {
        sendMail: async () => {
          throw Object.assign(new Error("SMTP unavailable"), { code: "ECONNECTION" });
        },
      },
      logger: { error() {} },
    });

    const failedAttempt = database.updates.at(-1);
    assert.equal(failedAttempt.params[1], "pending");
    assert.equal(failedAttempt.params[2], 2);
    assert.equal(failedAttempt.params[3], "ECONNECTION");
  });

  it("does not send a reminder after the booking is no longer approved", async () => {
    const database = createDatabase({
      id: "notification-id",
      event_type: "booking_reminder",
      recipient_email: "requester@example.test",
      attempts: 1,
      bookingStatus: "cancelled",
      meetingTitle: "Planning meeting",
      contactName: "Example Requester",
      contactEmail: "requester@example.test",
      date: "2026-12-01",
      startTime: "09:00",
      endTime: "10:00",
      hallName: "Main Hall",
    });
    let sendCount = 0;
    await processEmailNotifications({
      database,
      from: "booking@example.test",
      transporter: { sendMail: async () => { sendCount += 1; } },
      logger: { error: assert.fail },
    });

    assert.equal(sendCount, 0);
    assert.match(database.updates.at(-1).sql, /Booking is no longer approved/);
  });
});
