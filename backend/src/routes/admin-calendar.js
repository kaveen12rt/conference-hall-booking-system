import express from "express";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createAdminCalendarRouter({ database, frontendOrigin }) {
  const router = express.Router();

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
    if (!["approved", "rejected", "cancelled"].includes(nextStatus)) {
      return response.status(400).json({ error: { code: "INVALID_BOOKING_STATUS" } });
    }

    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        `SELECT id, contact_email AS "contactEmail", status, booking_date::text AS date,
                start_time AS "startTime"
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
        booking.status === "pending" ||
        (booking.status === "approved" && nextStatus === "cancelled");
      if (!allowedTransition) {
        await client.query("ROLLBACK");
        return response.status(409).json({ error: { code: "BOOKING_STATUS_CONFLICT" } });
      }

      await client.query(
        "UPDATE bookings SET status = $2, updated_at = NOW() WHERE id = $1",
        [booking.id, nextStatus],
      );
      await client.query(
        `INSERT INTO notifications (
           booking_id, event_type, channel, recipient_email, scheduled_at
         ) VALUES ($1, $2, 'email', $3, NOW())`,
        [booking.id, `booking_${nextStatus}`, booking.contactEmail],
      );

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
