import express from "express";
import { randomBytes } from "node:crypto";
import { encryptManageToken, hashManageToken } from "../notifications/manage-token.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createAdminCalendarRouter({
  database,
  frontendOrigin,
  authTokenSecret,
  adminNotificationEmail = "",
}) {
  const router = express.Router();

  router.get("/api/admin/notifications", async (_request, response) => {
    const result = await database.query(
      `SELECT b.id,
              b.hall_id AS "hallId",
              h.name AS "hallName",
              b.booking_date::text AS date,
              TO_CHAR(b.start_time, 'HH24:MI') AS "startTime",
              TO_CHAR(b.end_time, 'HH24:MI') AS "endTime",
              b.meeting_title AS "meetingTitle",
              b.contact_name AS "contactName",
              b.contact_designation AS "contactDesignation",
              b.created_at AS "submittedAt",
              COUNT(*) OVER() AS "totalCount"
       FROM bookings b
       JOIN conference_halls h ON h.id = b.hall_id
       WHERE b.status = 'pending'
       ORDER BY b.created_at DESC
       LIMIT 10`,
    );

    response.set("Cache-Control", "no-store");
    return response.json({
      pendingCount: Number(result.rows[0]?.totalCount ?? 0),
      pendingBookings: result.rows.map(({ totalCount: _totalCount, ...booking }) => booking),
    });
  });

  router.get("/api/admin/calendar/bookings", async (request, response) => {
    const { month, hallId } = request.query;
    if (
      typeof month !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      (hallId !== undefined &&
        (typeof hallId !== "string" || !UUID_PATTERN.test(hallId)))
    ) {
      return response.status(400).json({ error: { code: "INVALID_CALENDAR_QUERY" } });
    }

    const parameters = [month];
    let hallFilter = "";
    if (hallId) {
      parameters.push(hallId);
      hallFilter = "AND b.hall_id = $2";
    }

    const result = await database.query(
      `SELECT b.id,
              b.hall_id AS "hallId",
              h.name AS "hallName",
              b.booking_date::text AS date,
              TO_CHAR(b.start_time, 'HH24:MI') AS "startTime",
              TO_CHAR(b.end_time, 'HH24:MI') AS "endTime",
              b.meeting_title AS "meetingTitle",
              b.participant_count AS "participantCount",
              b.contact_name AS "contactName",
              b.contact_designation AS "contactDesignation",
              b.contact_email AS "contactEmail",
              b.contact_phone AS "contactPhone",
              b.status
       FROM bookings b
       JOIN conference_halls h ON h.id = b.hall_id
       WHERE b.booking_date >= ($1 || '-01')::date
         AND b.booking_date < (($1 || '-01')::date + INTERVAL '1 month')
         ${hallFilter}
       ORDER BY b.booking_date, b.start_time`,
      parameters,
    );

    response.set("Cache-Control", "no-store");
    return response.json({ month, bookings: result.rows });
  });

  router.patch("/api/admin/calendar/bookings/:bookingId/status", async (request, response) => {
    if (request.get("origin") !== frontendOrigin) {
      return response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED" } });
    }
    if (!UUID_PATTERN.test(request.params.bookingId)) {
      return response.status(400).json({ error: { code: "INVALID_BOOKING_ID" } });
    }
    const nextStatus = request.body?.status;
    if (!["approved", "rejected", "cancelled", "pending"].includes(nextStatus)) {
      return response.status(400).json({ error: { code: "INVALID_BOOKING_STATUS" } });
    }

    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        `SELECT id, hall_id AS "hallId", contact_email AS "contactEmail",
                status, booking_date::text AS date, start_time AS "startTime",
                end_time AS "endTime"
         FROM bookings
         WHERE id = $1
         FOR UPDATE`,
        [request.params.bookingId],
      );
      const booking = currentResult.rows[0];
      if (!booking) {
        await client.query("ROLLBACK");
        return response.status(404).json({ error: { code: "BOOKING_NOT_FOUND" } });
      }
      const allowedTransition =
        (booking.status === "pending" &&
          ["approved", "rejected", "cancelled"].includes(nextStatus)) ||
        (booking.status === "approved" && nextStatus === "cancelled") ||
        (booking.status === "cancelled" && nextStatus === "pending");
      if (!allowedTransition) {
        await client.query("ROLLBACK");
        return response.status(409).json({ error: { code: "BOOKING_STATUS_CONFLICT" } });
      }

      if (booking.status === "cancelled" && nextStatus === "pending") {
        const stillUpcoming = await client.query(
          `SELECT ($1::date + $2::time) > (NOW() AT TIME ZONE 'Asia/Colombo') AS upcoming`,
          [booking.date, booking.startTime],
        );
        if (!stillUpcoming.rows[0]?.upcoming) {
          await client.query("ROLLBACK");
          return response.status(409).json({ error: { code: "BOOKING_DATE_PASSED" } });
        }
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [`${booking.hallId}:${booking.date}`],
        );
        const conflict = await client.query(
          `SELECT 1
           FROM bookings
           WHERE id <> $1
             AND hall_id = $2
             AND booking_date = $3
             AND status IN ('pending', 'approved')
             AND start_time < $5
             AND end_time > $4
           LIMIT 1`,
          [booking.id, booking.hallId, booking.date, booking.startTime, booking.endTime],
        );
        if (conflict.rowCount > 0) {
          await client.query("ROLLBACK");
          return response.status(409).json({ error: { code: "BOOKING_TIME_UNAVAILABLE" } });
        }
      }

      const restoredManageToken = nextStatus === "pending" && booking.status === "cancelled"
        ? randomBytes(32).toString("base64url")
        : null;
      await client.query(
        `UPDATE bookings
         SET status = $2,
             manage_token_hash = CASE WHEN $2 = 'pending' THEN $3
                                      WHEN $2 IN ('rejected', 'cancelled') THEN NULL
                                      ELSE manage_token_hash END,
             updated_at = NOW()
         WHERE id = $1`,
        [
          booking.id,
          nextStatus,
          restoredManageToken ? hashManageToken(restoredManageToken) : null,
        ],
      );
      if (nextStatus === "rejected" || nextStatus === "cancelled") {
        await client.query(
          `UPDATE notifications
           SET manage_token_encrypted = NULL
           WHERE booking_id = $1 AND event_type = 'booking_received'
             AND delivery_status IN ('pending', 'sending')`,
          [booking.id],
        );
      }
      await client.query(
        `INSERT INTO notifications (
           booking_id, event_type, channel, recipient_email, scheduled_at,
           manage_token_encrypted
         ) VALUES ($1, $2, 'email', $3, NOW(), $4)`,
        [
          booking.id,
          booking.status === "cancelled" && nextStatus === "pending"
            ? "booking_reopened"
            : `booking_${nextStatus}`,
          booking.contactEmail,
          restoredManageToken ? encryptManageToken(restoredManageToken, authTokenSecret) : null,
        ],
      );
      if (booking.status === "cancelled" && nextStatus === "pending" && adminNotificationEmail) {
        await client.query(
          `INSERT INTO notifications (
             booking_id, event_type, channel, recipient_email, scheduled_at
           ) VALUES ($1, 'booking_reopened_admin', 'email', $2, NOW())`,
          [booking.id, adminNotificationEmail],
        );
      }

      if (nextStatus === "approved") {
        await client.query(
          `INSERT INTO notifications (
             booking_id, event_type, channel, recipient_email, scheduled_at
           )
           SELECT id, 'booking_reminder', 'email', contact_email,
                  GREATEST(
                    (booking_date + start_time) AT TIME ZONE 'Asia/Colombo'
                      - INTERVAL '1 hour',
                    NOW()
                  )
           FROM bookings
           WHERE id = $1
             AND (booking_date + start_time) > (NOW() AT TIME ZONE 'Asia/Colombo')`,
          [booking.id],
        );
      } else {
        await client.query(
          `UPDATE notifications
           SET delivery_status = 'failed',
               last_error = 'Booking is no longer approved'
           WHERE booking_id = $1
             AND event_type = 'booking_reminder'
             AND delivery_status = 'pending'`,
          [booking.id],
        );
      }

      await client.query(
        `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'booking', $3, $4)`,
        [
          request.admin.id,
          `booking.${nextStatus}`,
          booking.id,
          JSON.stringify({ previousStatus: booking.status, status: nextStatus }),
        ],
      );
      await client.query("COMMIT");
      return response.json({ bookingId: booking.id, status: nextStatus });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  return router;
}
