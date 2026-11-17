import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { processEmailNotifications } from "../src/notifications/email-worker.js";

function createDatabase(notification) {
  const updates = [];
  return {
    updates,
    async query(sql, params = []) {
      if (sql.includes("WITH due AS")) {
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
    assert.equal(sent[0].to, "requester@example.test");
    assert.match(sent[0].text, /Main Hall/);
    assert.equal(database.updates.at(-1).params[0], "notification-id");
    assert.match(database.updates.at(-1).sql, /delivery_status = 'sent'/);
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
