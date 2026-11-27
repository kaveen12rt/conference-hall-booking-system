import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import { encryptManageToken, hashManageToken } from "../notifications/manage-token.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isQuarterHour(value) {
  return TIME_PATTERN.test(value) && Number(value.slice(3)) % 15 === 0;
}

function boundedText(value, maxLength) {
  return typeof value === "string" && value.trim().length <= maxLength
    ? value.trim()
    : null;
}

function validDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function getSriLankaDateTime(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Colombo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function getBookingTimeError(bookingDate, startTime) {
  const now = getSriLankaDateTime();
  if (bookingDate < now.date) {
    return "BOOKING_DATE_PASSED";
  }
  if (bookingDate === now.date && startTime <= now.time) {
    return "BOOKING_START_TIME_PASSED";
  }
  return "";
}

function normalizeHallRow(row) {
  if (!row) return row;
  const windows =
    typeof row.maintenanceWindows === "string"
      ? JSON.parse(row.maintenanceWindows)
      : (row.maintenanceWindows ?? []);
  return {
    ...row,
    facilities:
      typeof row.facilities === "string"
        ? JSON.parse(row.facilities)
        : (row.facilities ?? []),
    maintenanceWindows: [...windows].sort((a, b) =>
      String(a.startsAt).localeCompare(String(b.startsAt)),
    ),
  };
}

function validateBooking(body = {}) {
  const booking = {
    hallId: body.hallId,
    meetingTitle: boundedText(body.meetingTitle, 160),
    purpose: boundedText(body.purpose ?? "", 2000),
    bookingDate: body.bookingDate,
    startTime: body.startTime,
    endTime: body.endTime,
    participantCount: body.participantCount,
    contactName: boundedText(body.contactName, 160),
    contactDesignation:
      body.contactDesignation === undefined
        ? ""
        : boundedText(body.contactDesignation, 160),
    contactEmail: boundedText(body.contactEmail, 254),
    contactPhone: boundedText(body.contactPhone, 32),
    additionalRequirements:
      body.additionalRequirements === undefined
        ? ""
        : boundedText(body.additionalRequirements, 2000),
  };

  if (
    (body.website !== undefined && body.website !== "") ||
    !UUID_PATTERN.test(booking.hallId ?? "") ||
    !booking.meetingTitle ||
    booking.purpose === null ||
    !validDate(booking.bookingDate) ||
    !isQuarterHour(booking.startTime ?? "") ||
    !isQuarterHour(booking.endTime ?? "") ||
    booking.endTime <= booking.startTime ||
    !Number.isInteger(booking.participantCount) ||
    booking.participantCount < 1 ||
    !booking.contactName ||
    booking.contactDesignation === null ||
    !booking.contactEmail ||
    !EMAIL_PATTERN.test(booking.contactEmail) ||
    !booking.contactPhone ||
    booking.contactPhone.length < 6 ||
    booking.contactPhone.length > 32 ||
    booking.additionalRequirements === null
  ) {
    return null;
  }

  return booking;
}

export function createPublicBookingRouter({
  database,
  adminNotificationEmail = "",
  emailDeliveryConfigured = false,
  authTokenSecret,
}) {
  const router = express.Router();
  const bookingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipFailedRequests: true,
    handler: (_request, response) => {
      response.status(429).json({ error: { code: "BOOKING_RATE_LIMIT_EXCEEDED" } });
    },
  });
  const statusLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({ error: { code: "STATUS_RATE_LIMIT_EXCEEDED" } });
    },
  });
  const managementLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({ error: { code: "BOOKING_MANAGEMENT_RATE_LIMIT_EXCEEDED" } });
    },
  });

  router.get("/api/halls", async (_request, response) => {
    const result = await database.query(
      `SELECT h.id, h.name, h.description, h.capacity, h.facilities,
              COALESCE((
                SELECT JSON_ARRAYAGG(
                  JSON_OBJECT(
                    'id', mw.id,
                    'startsAt', DATE_FORMAT(mw.starts_at, '%Y-%m-%dT%H:%i:%s.000Z'),
                    'endsAt', DATE_FORMAT(mw.ends_at, '%Y-%m-%dT%H:%i:%s.000Z')
                  )
                )
                FROM hall_maintenance_windows mw
                WHERE mw.hall_id = h.id AND mw.ends_at > UTC_TIMESTAMP(3)
              ), JSON_ARRAY()) AS maintenanceWindows
       FROM conference_halls h
       WHERE h.is_active = TRUE AND h.bookings_paused = FALSE
       ORDER BY h.name`,
    );
    response.json({ halls: result.rows.map(normalizeHallRow) });
  });

  router.get("/api/availability", async (request, response) => {
    const { hallId, month } = request.query;
    if (
      (hallId !== undefined &&
        (typeof hallId !== "string" || !UUID_PATTERN.test(hallId))) ||
      typeof month !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ) {
      return response.status(400).json({ error: { code: "INVALID_AVAILABILITY_QUERY" } });
    }

    const result = await database.query(
      `SELECT DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS date,
              TIME_FORMAT(b.start_time, '%H:%i') AS startTime,
              TIME_FORMAT(b.end_time, '%H:%i') AS endTime,
              h.name AS hallName,
              CASE
                WHEN b.status = 'approved'
                  AND TIMESTAMP(b.booking_date, b.end_time) <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)
                  THEN 'completed'
                ELSE 'reserved'
              END AS status
       FROM bookings b
       JOIN conference_halls h ON h.id = b.hall_id
       WHERE ($1 IS NULL OR b.hall_id = $1)
         AND b.booking_date >= CONCAT($2, '-01')
         AND b.booking_date < DATE_ADD(CONCAT($2, '-01'), INTERVAL 1 MONTH)
         AND b.status IN ('pending', 'approved')
       ORDER BY b.booking_date, b.start_time, h.name`,
      [hallId ?? null, month],
    );

    response.set("Cache-Control", "no-store");
    return response.json({ hallId: hallId ?? null, month, slots: result.rows });
  });

  router.post("/api/bookings", bookingLimiter, async (request, response) => {
    const booking = validateBooking({ ...request.body, purpose: "" });
    if (!booking) {
      return response.status(400).json({ error: { code: "INVALID_BOOKING" } });
    }
    const timeError = getBookingTimeError(booking.bookingDate, booking.startTime);
    if (timeError) {
      return response.status(400).json({ error: { code: timeError } });
    }

    const reference = randomBytes(32).toString("base64url");
    const referenceHash = createHash("sha256").update(reference).digest("hex");
    const manageToken = randomBytes(32).toString("base64url");
    const manageTokenHash = hashManageToken(manageToken);
    const encryptedManageToken = encryptManageToken(manageToken, authTokenSecret);
    const bookingId = randomUUID();
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const hallResult = await client.query(
        `SELECT id, capacity
         FROM conference_halls
         WHERE id = $1 AND is_active = TRUE AND bookings_paused = FALSE
         FOR UPDATE`,
        [booking.hallId],
      );
      const hall = hallResult.rows[0];
      if (!hall || booking.participantCount > hall.capacity) {
        await client.query("ROLLBACK");
        return response.status(400).json({ error: { code: "HALL_UNAVAILABLE" } });
      }

      const maintenanceConflict = await client.query(
        `SELECT 1
         FROM hall_maintenance_windows
         WHERE hall_id = $1
           AND starts_at < DATE_SUB(TIMESTAMP($2, $4), INTERVAL 330 MINUTE)
           AND ends_at > DATE_SUB(TIMESTAMP($2, $3), INTERVAL 330 MINUTE)
         LIMIT 1`,
        [
          booking.hallId,
          booking.bookingDate,
          booking.startTime,
          booking.endTime,
        ],
      );
      if (maintenanceConflict.rowCount > 0) {
        await client.query("ROLLBACK");
        return response.status(409).json({
          error: { code: "MAINTENANCE_TIME_UNAVAILABLE" },
        });
      }

      const conflict = await client.query(
        `SELECT 1
         FROM bookings
         WHERE hall_id = $1
           AND booking_date = $2
           AND status IN ('pending', 'approved')
           AND TIMESTAMP(booking_date, end_time) > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)
           AND start_time < $4
           AND end_time > $3
         LIMIT 1`,
        [
          booking.hallId,
          booking.bookingDate,
          booking.startTime,
          booking.endTime,
        ],
      );

      if (conflict.rowCount > 0) {
        await client.query("ROLLBACK");
        return response.status(409).json({
          error: { code: "BOOKING_TIME_UNAVAILABLE" },
        });
      }

      await client.query(
        `INSERT INTO bookings (
           id, hall_id, reference_hash, meeting_title, purpose, booking_date,
           start_time, end_time, participant_count, contact_name, contact_designation, contact_email,
           contact_phone, additional_requirements, manage_token_hash, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'approved')`,
        [
          bookingId,
          booking.hallId,
          referenceHash,
          booking.meetingTitle,
          booking.purpose,
          booking.bookingDate,
          booking.startTime,
          booking.endTime,
          booking.participantCount,
          booking.contactName,
          booking.contactDesignation,
          booking.contactEmail,
          booking.contactPhone,
          booking.additionalRequirements,
          manageTokenHash,
        ],
      );
      await client.query(
        `INSERT INTO notifications (
           id, booking_id, event_type, channel, recipient_email, scheduled_at,
           manage_token_encrypted
         ) VALUES ($1, $2, 'booking_approved', 'email', $3, UTC_TIMESTAMP(3), $4)`,
        [randomUUID(), bookingId, booking.contactEmail, encryptedManageToken],
      );
      if (adminNotificationEmail) {
        await client.query(
          `INSERT INTO notifications (
             id, booking_id, event_type, channel, recipient_email, scheduled_at
           ) VALUES ($1, $2, 'new_booking_confirmed', 'email', $3, UTC_TIMESTAMP(3))`,
          [randomUUID(), bookingId, adminNotificationEmail],
        );
      }
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
        [randomUUID(), bookingId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return response.status(201).json({
      reference,
      status: "approved",
      statusEndpoint: "/api/bookings/status",
      emailStatus: emailDeliveryConfigured
        ? "queued"
        : "configuration_required",
    });
  });

  router.post("/api/bookings/status", statusLimiter, async (request, response) => {
    const { reference } = request.body ?? {};
    if (typeof reference !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(reference)) {
      return response.status(404).json({ error: { code: "BOOKING_NOT_FOUND" } });
    }

    const referenceHash = createHash("sha256").update(reference).digest("hex");
    const result = await database.query(
      `SELECT status,
              DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at
       FROM bookings
       WHERE reference_hash = $1`,
      [referenceHash],
    );
    const booking = result.rows[0];

    if (!booking) {
      return response.status(404).json({ error: { code: "BOOKING_NOT_FOUND" } });
    }

    return response.json({
      status: booking.status,
      submittedAt: booking.created_at,
    });
  });

  router.post("/api/bookings/manage", managementLimiter, async (request, response) => {
    const { manageToken } = request.body ?? {};
    if (typeof manageToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(manageToken)) {
      return response.status(404).json({ error: { code: "BOOKING_MANAGEMENT_NOT_FOUND" } });
    }

    const result = await database.query(
      `SELECT b.hall_id AS hallId,
              b.meeting_title AS meetingTitle,
              b.purpose,
              DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS bookingDate,
              TIME_FORMAT(b.start_time, '%H:%i') AS startTime,
              TIME_FORMAT(b.end_time, '%H:%i') AS endTime,
              b.participant_count AS participantCount,
              b.contact_name AS contactName,
              b.contact_designation AS contactDesignation,
              b.contact_email AS contactEmail,
              b.contact_phone AS contactPhone,
              b.additional_requirements AS additionalRequirements,
              b.status,
              (TIMESTAMP(b.booking_date, b.start_time) > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 390 MINUTE))
                AS moreThanHourRemaining
       FROM bookings b
       WHERE b.manage_token_hash = $1`,
      [hashManageToken(manageToken)],
    );
    const rawBooking = result.rows[0];
    if (!rawBooking) {
      return response.status(404).json({ error: { code: "BOOKING_MANAGEMENT_NOT_FOUND" } });
    }
    const booking = {
      ...rawBooking,
      moreThanHourRemaining: Boolean(rawBooking.moreThanHourRemaining),
    };

    response.set("Cache-Control", "no-store");
    return response.json({
      booking,
      canEdit: ["pending", "approved"].includes(booking.status) &&
        (booking.status !== "approved" || booking.moreThanHourRemaining),
      canCancel: ["pending", "approved"].includes(booking.status) &&
        booking.moreThanHourRemaining,
    });
  });

  router.patch("/api/bookings/manage", managementLimiter, async (request, response) => {
    const { manageToken } = request.body ?? {};
    if (typeof manageToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(manageToken)) {
      return response.status(404).json({ error: { code: "BOOKING_MANAGEMENT_NOT_FOUND" } });
    }

    const tokenHash = hashManageToken(manageToken);
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        `SELECT id, hall_id AS hallId, meeting_title AS meetingTitle,
                purpose,
                DATE_FORMAT(booking_date, '%Y-%m-%d') AS bookingDate,
                TIME_FORMAT(start_time, '%H:%i') AS startTime,
                TIME_FORMAT(end_time, '%H:%i') AS endTime,
                participant_count AS participantCount,
                contact_name AS contactName, contact_email AS contactEmail,
                contact_designation AS contactDesignation,
                contact_phone AS contactPhone,
                additional_requirements AS additionalRequirements,
                status,
                (TIMESTAMP(booking_date, start_time) > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 390 MINUTE))
                  AS moreThanHourRemaining
         FROM bookings
         WHERE manage_token_hash = $1
         FOR UPDATE`,
        [tokenHash],
      );
      const current = currentResult.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return response.status(404).json({ error: { code: "BOOKING_MANAGEMENT_NOT_FOUND" } });
      }
      if (!["pending", "approved"].includes(current.status)) {
        await client.query("ROLLBACK");
        return response.status(409).json({ error: { code: "BOOKING_NOT_EDITABLE" } });
      }
      if (current.status === "approved" && !current.moreThanHourRemaining) {
        await client.query("ROLLBACK");
        return response.status(409).json({ error: { code: "BOOKING_CANCELLATION_TOO_LATE" } });
      }

      const booking = validateBooking({
        ...request.body,
        purpose: current.purpose,
        contactName: current.contactName,
        contactDesignation: current.contactDesignation,
        contactEmail: current.contactEmail,
        contactPhone: current.contactPhone,
      });
      if (!booking) {
        await client.query("ROLLBACK");
        return response.status(400).json({ error: { code: "INVALID_BOOKING" } });
      }
      const timeError = getBookingTimeError(booking.bookingDate, booking.startTime);
      if (timeError) {
        await client.query("ROLLBACK");
        return response.status(400).json({ error: { code: timeError } });
      }

      const hallResult = await client.query(
        `SELECT id, capacity FROM conference_halls
         WHERE id = $1 AND is_active = TRUE
           AND (bookings_paused = FALSE OR id = $2)
         FOR UPDATE`,
        [booking.hallId, current.hallId],
      );
      const hall = hallResult.rows[0];
      if (!hall || booking.participantCount > hall.capacity) {
        await client.query("ROLLBACK");
        return response.status(400).json({ error: { code: "HALL_UNAVAILABLE" } });
      }

      const maintenanceConflict = await client.query(
        `SELECT 1
         FROM hall_maintenance_windows
         WHERE hall_id = $1
           AND starts_at < DATE_SUB(TIMESTAMP($2, $4), INTERVAL 330 MINUTE)
           AND ends_at > DATE_SUB(TIMESTAMP($2, $3), INTERVAL 330 MINUTE)
         LIMIT 1`,
        [
          booking.hallId,
          booking.bookingDate,
          booking.startTime,
          booking.endTime,
        ],
      );
      if (maintenanceConflict.rowCount > 0) {
        await client.query("ROLLBACK");
        return response.status(409).json({
          error: { code: "MAINTENANCE_TIME_UNAVAILABLE" },
        });
      }

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
        [
          current.id,
          booking.hallId,
          booking.bookingDate,
          booking.startTime,
          booking.endTime,
        ],
      );
      if (conflict.rowCount > 0) {
        await client.query("ROLLBACK");
        return response.status(409).json({ error: { code: "BOOKING_TIME_UNAVAILABLE" } });
      }

      const isUnchanged = [
        "hallId",
        "meetingTitle",
        "purpose",
        "bookingDate",
        "startTime",
        "endTime",
        "participantCount",
        "contactDesignation",
        "additionalRequirements",
      ].every((key) => String(booking[key]) === String(current[key]));
      let nextStatus = current.status;
      if (!isUnchanged) {
        nextStatus = "approved";
        await client.query(
          `UPDATE bookings
           SET hall_id = $2, meeting_title = $3, purpose = $4, booking_date = $5,
               start_time = $6, end_time = $7, participant_count = $8,
               additional_requirements = $9, status = $10,
               updated_at = UTC_TIMESTAMP(3)
           WHERE id = $1`,
          [
            current.id,
            booking.hallId,
            booking.meetingTitle,
            booking.purpose,
            booking.bookingDate,
            booking.startTime,
            booking.endTime,
            booking.participantCount,
            booking.additionalRequirements,
            nextStatus,
          ],
        );
        if (current.status === "approved") {
          await client.query(
            `UPDATE notifications
             SET delivery_status = 'failed', claimed_at = NULL,
                 last_error = 'Booking details changed'
             WHERE booking_id = $1 AND event_type = 'booking_reminder'
               AND delivery_status IN ('pending', 'sending')`,
            [current.id],
          );
        }
        await client.query(
          `INSERT INTO notifications (
             id, booking_id, event_type, channel, recipient_email, scheduled_at
           ) VALUES ($1, $2, $3, 'email', $4, UTC_TIMESTAMP(3))`,
          [
            randomUUID(),
            current.id,
            "booking_updated",
            current.contactEmail,
          ],
        );
        if (adminNotificationEmail) {
          await client.query(
            `INSERT INTO notifications (
               id, booking_id, event_type, channel, recipient_email, scheduled_at
             ) VALUES ($1, $2, 'booking_changed', 'email', $3, UTC_TIMESTAMP(3))`,
            [randomUUID(), current.id, adminNotificationEmail],
          );
        }
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
          [randomUUID(), current.id],
        );
      }
      await client.query("COMMIT");
      return response.json({ status: nextStatus, changed: !isUnchanged });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  router.post("/api/bookings/manage/cancel", managementLimiter, async (request, response) => {
    const { manageToken } = request.body ?? {};
    if (typeof manageToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(manageToken)) {
      return response.status(404).json({ error: { code: "BOOKING_MANAGEMENT_NOT_FOUND" } });
    }

    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        `SELECT id, status, contact_email AS contactEmail,
                (TIMESTAMP(booking_date, start_time) > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 390 MINUTE))
                  AS moreThanHourRemaining
         FROM bookings
         WHERE manage_token_hash = $1
         FOR UPDATE`,
        [hashManageToken(manageToken)],
      );
      const booking = currentResult.rows[0];
      if (!booking) {
        await client.query("ROLLBACK");
        return response.status(404).json({ error: { code: "BOOKING_MANAGEMENT_NOT_FOUND" } });
      }
      if (!["pending", "approved"].includes(booking.status)) {
        await client.query("ROLLBACK");
        return response.status(409).json({ error: { code: "BOOKING_NOT_CANCELLABLE" } });
      }
      if (!booking.moreThanHourRemaining) {
        await client.query("ROLLBACK");
        return response.status(409).json({ error: { code: "BOOKING_CANCELLATION_TOO_LATE" } });
      }

      await client.query(
        `UPDATE bookings
         SET status = 'cancelled',
             manage_token_hash = NULL,
             updated_at = UTC_TIMESTAMP(3)
         WHERE id = $1`,
        [booking.id],
      );
      await client.query(
        `UPDATE notifications
         SET delivery_status = 'failed', claimed_at = NULL,
             manage_token_encrypted = NULL,
             last_error = 'Booking was cancelled'
         WHERE booking_id = $1
           AND event_type IN ('booking_received', 'booking_approved', 'new_booking_confirmed')
           AND delivery_status IN ('pending', 'sending')`,
        [booking.id],
      );
      await client.query(
        `UPDATE notifications
         SET delivery_status = 'failed', claimed_at = NULL,
             last_error = 'Booking was cancelled'
         WHERE booking_id = $1 AND event_type = 'booking_reminder'
           AND delivery_status IN ('pending', 'sending')`,
        [booking.id],
      );
      await client.query(
        `INSERT INTO notifications (
           id, booking_id, event_type, channel, recipient_email, scheduled_at
         ) VALUES ($1, $2, 'booking_cancelled', 'email', $3, UTC_TIMESTAMP(3))`,
        [randomUUID(), booking.id, booking.contactEmail],
      );
      if (adminNotificationEmail) {
        await client.query(
          `INSERT INTO notifications (
             id, booking_id, event_type, channel, recipient_email, scheduled_at
           ) VALUES ($1, $2, 'requester_booking_cancelled', 'email', $3, UTC_TIMESTAMP(3))`,
          [randomUUID(), booking.id, adminNotificationEmail],
        );
      }
      await client.query("COMMIT");
      return response.json({ status: "cancelled" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  return router;
}
