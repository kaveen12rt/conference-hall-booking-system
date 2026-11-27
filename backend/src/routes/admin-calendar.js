import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { encryptManageToken, hashManageToken } from "../notifications/manage-token.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createAdminCalendarRouter({
  database,
  frontendOrigin,
  frontendOrigins = [frontendOrigin],
  authTokenSecret,
  adminNotificationEmail = "",
}) {
  const router = express.Router();
  const isAllowedOrigin = (request) => frontendOrigins.includes(request.get("origin"));

  router.get("/api/admin/reports/monthly", async (request, response) => {
    const { month } = request.query;
    if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return response.status(400).json({ error: { code: "INVALID_REPORT_MONTH" } });
    }

    const [year, monthNumber] = month.split("-").map(Number);
    const nextMonth = new Date(Date.UTC(year, monthNumber, 1))
      .toISOString()
      .slice(0, 10);
    const result = await database.query(
      `SELECT DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS date,
              CAST(COUNT(*) AS UNSIGNED) AS totalRequests,
              CAST(SUM(
                CASE
                  WHEN b.status = 'approved'
                    AND TIMESTAMP(b.booking_date, b.end_time) <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)
                    THEN 1 ELSE 0
                END
              ) AS UNSIGNED) AS completedMeetings,
              CAST(SUM(
                CASE
                  WHEN b.status = 'approved'
                    AND TIMESTAMP(b.booking_date, b.end_time) > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)
                    THEN 1 ELSE 0
                END
              ) AS UNSIGNED) AS scheduledMeetings,
              CAST(SUM(CASE WHEN b.status = 'pending' THEN 1 ELSE 0 END) AS UNSIGNED) AS pendingRequests,
              CAST(SUM(CASE WHEN b.status IN ('cancelled', 'rejected') THEN 1 ELSE 0 END) AS UNSIGNED) AS closedRequests
       FROM bookings b
       WHERE b.booking_date >= $1
         AND b.booking_date < $2
       GROUP BY b.booking_date
       ORDER BY b.booking_date`,
      [`${month}-01`, nextMonth],
    );

    const days = result.rows.map((row) => ({
      ...row,
      totalRequests: Number(row.totalRequests),
      completedMeetings: Number(row.completedMeetings),
      scheduledMeetings: Number(row.scheduledMeetings),
      pendingRequests: Number(row.pendingRequests),
      closedRequests: Number(row.closedRequests),
    }));

    response.set("Cache-Control", "no-store");
    return response.json({ month, days });
  });

  router.get("/api/admin/notifications", async (_request, response) => {
    const result = await database.query(
      `SELECT b.id,
              b.hall_id AS hallId,
              h.name AS hallName,
              DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS date,
              TIME_FORMAT(b.start_time, '%H:%i') AS startTime,
              TIME_FORMAT(b.end_time, '%H:%i') AS endTime,
              b.meeting_title AS meetingTitle,
              b.contact_name AS contactName,
              b.contact_designation AS contactDesignation,
              b.status,
              DATE_FORMAT(b.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS submittedAt,
              COUNT(*) OVER() AS totalCount
       FROM bookings b
       JOIN conference_halls h ON h.id = b.hall_id
       WHERE b.created_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 24 HOUR)
         AND b.status IN ('approved', 'cancelled', 'rejected')
       ORDER BY b.created_at DESC
       LIMIT 10`,
    );

    response.set("Cache-Control", "no-store");
    return response.json({
      recentBookingCount: Number(result.rows[0]?.totalCount ?? 0),
      recentBookings: result.rows.map(({ totalCount: _totalCount, ...booking }) => booking),
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
              b.hall_id AS hallId,
              h.name AS hallName,
              DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS date,
              TIME_FORMAT(b.start_time, '%H:%i') AS startTime,
              TIME_FORMAT(b.end_time, '%H:%i') AS endTime,
              b.meeting_title AS meetingTitle,
              b.participant_count AS participantCount,
              b.contact_name AS contactName,
              b.contact_designation AS contactDesignation,
              b.contact_email AS contactEmail,
              b.contact_phone AS contactPhone,
              CASE
                WHEN b.status = 'approved'
                  AND TIMESTAMP(b.booking_date, b.end_time) <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)
                  THEN 'completed'
                ELSE b.status
              END AS status
       FROM bookings b
       JOIN conference_halls h ON h.id = b.hall_id
       WHERE b.booking_date >= CONCAT($1, '-01')
         AND b.booking_date < DATE_ADD(CONCAT($1, '-01'), INTERVAL 1 MONTH)
         ${hallFilter}
       ORDER BY b.booking_date, b.start_time`,
      parameters,
    );

    response.set("Cache-Control", "no-store");
    return response.json({ month, bookings: result.rows });
  });

  router.patch("/api/admin/calendar/bookings/:bookingId/status", async (request, response) => {
    if (!isAllowedOrigin(request)) {
      return response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED" } });
    }
    if (!UUID_PATTERN.test(request.params.bookingId)) {
      return response.status(400).json({ error: { code: "INVALID_BOOKING_ID" } });
    }
    const nextStatus = request.body?.status;
    if (!["approved", "rejected", "cancelled"].includes(nextStatus)) {
      return response.status(400).json({ error: { code: "INVALID_BOOKING_STATUS" } });
    }

    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        `SELECT id, hall_id AS hallId, contact_email AS contactEmail,
                status,
                DATE_FORMAT(booking_date, '%Y-%m-%d') AS date,
                TIME_FORMAT(start_time, '%H:%i') AS startTime,
                TIME_FORMAT(end_time, '%H:%i') AS endTime
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
          ["rejected", "cancelled"].includes(nextStatus)) ||
        (booking.status === "approved" && nextStatus === "cancelled") ||
        (booking.status === "cancelled" && nextStatus === "approved");
      if (!allowedTransition) {
        await client.query("ROLLBACK");
        return response.status(409).json({ error: { code: "BOOKING_STATUS_CONFLICT" } });
      }

      if (booking.status === "cancelled" && nextStatus === "approved") {
        const stillUpcoming = await client.query(
          `SELECT (TIMESTAMP($1, $2) > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)) AS upcoming`,
          [booking.date, booking.startTime],
        );
        if (!stillUpcoming.rows[0]?.upcoming) {
          await client.query("ROLLBACK");
          return response.status(409).json({ error: { code: "BOOKING_DATE_PASSED" } });
        }
        await client.query(
          "SELECT id FROM conference_halls WHERE id = $1 FOR UPDATE",
          [booking.hallId],
        );
        const conflict = await client.query(
          `SELECT 1
           FROM bookings
           WHERE id <> $1
             AND hall_id = $2
             AND booking_date = $3
             AND status IN ('pending', 'approved')
             AND TIMESTAMP(booking_date, end_time) > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)
             AND start_time < $5
             AND end_time > $4
           LIMIT 1`,
          [booking.id, booking.hallId, booking.date, booking.startTime, booking.endTime],
        );
        if (conflict.rowCount > 0) {
          await client.query("ROLLBACK");
          return response.status(409).json({ error: { code: "BOOKING_TIME_UNAVAILABLE" } });
        }
        const maintenanceConflict = await client.query(
          `SELECT 1
           FROM hall_maintenance_windows
           WHERE hall_id = $1
             AND starts_at < DATE_SUB(TIMESTAMP($2, $4), INTERVAL 330 MINUTE)
             AND ends_at > DATE_SUB(TIMESTAMP($2, $3), INTERVAL 330 MINUTE)
           LIMIT 1`,
          [booking.hallId, booking.date, booking.startTime, booking.endTime],
        );
        if (maintenanceConflict.rowCount > 0) {
          await client.query("ROLLBACK");
          return response.status(409).json({
            error: { code: "MAINTENANCE_TIME_UNAVAILABLE" },
          });
        }
      }

      const restoredManageToken = nextStatus === "approved" && booking.status === "cancelled"
        ? randomBytes(32).toString("base64url")
        : null;
      await client.query(
        `UPDATE bookings
         SET status = $2,
             manage_token_hash = CASE WHEN $3 IS NOT NULL THEN $3
                                      WHEN $2 IN ('rejected', 'cancelled') THEN NULL
                                      ELSE manage_token_hash END,
             updated_at = UTC_TIMESTAMP(3)
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
           SET delivery_status = 'failed', claimed_at = NULL,
               manage_token_encrypted = NULL,
               last_error = 'Booking is no longer confirmed'
           WHERE booking_id = $1
             AND event_type IN ('booking_received', 'booking_approved', 'new_booking_confirmed')
             AND delivery_status IN ('pending', 'sending')`,
          [booking.id],
        );
      }
      await client.query(
        `INSERT INTO notifications (
           id, booking_id, event_type, channel, recipient_email, scheduled_at,
           manage_token_encrypted
         ) VALUES ($1, $2, $3, 'email', $4, UTC_TIMESTAMP(3), $5)`,
        [
          randomUUID(),
          booking.id,
          booking.status === "cancelled" && nextStatus === "approved"
            ? "booking_reopened"
            : `booking_${nextStatus}`,
          booking.contactEmail,
          restoredManageToken ? encryptManageToken(restoredManageToken, authTokenSecret) : null,
        ],
      );
      if (booking.status === "cancelled" && nextStatus === "approved" && adminNotificationEmail) {
        await client.query(
          `INSERT INTO notifications (
             id, booking_id, event_type, channel, recipient_email, scheduled_at
           ) VALUES ($1, $2, 'booking_reopened_admin', 'email', $3, UTC_TIMESTAMP(3))`,
          [randomUUID(), booking.id, adminNotificationEmail],
        );
      }

      if (nextStatus === "approved") {
        await client.query(
          `INSERT INTO notifications (
             id, booking_id, event_type, channel, recipient_email, scheduled_at
           )
           SELECT $1, id, 'booking_reminder', 'email', contact_email,
                  GREATEST(
                    DATE_SUB(TIMESTAMP(booking_date, start_time), INTERVAL 390 MINUTE),
                    UTC_TIMESTAMP(3)
                  )
           FROM bookings
           WHERE id = $2
             AND TIMESTAMP(booking_date, start_time) > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)`,
          [randomUUID(), booking.id],
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
        `INSERT INTO audit_logs (id, admin_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, 'booking', $4, $5)`,
        [
          randomUUID(),
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
