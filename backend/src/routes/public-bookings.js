import { createHash, randomBytes } from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";

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

function validateBooking(body = {}) {
  const booking = {
    hallId: body.hallId,
    meetingTitle: boundedText(body.meetingTitle, 160),
    purpose: boundedText(body.purpose, 2000),
    bookingDate: body.bookingDate,
    startTime: body.startTime,
    endTime: body.endTime,
    participantCount: body.participantCount,
    contactName: boundedText(body.contactName, 160),
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
    !booking.purpose ||
    !validDate(booking.bookingDate) ||
    !isQuarterHour(booking.startTime ?? "") ||
    !isQuarterHour(booking.endTime ?? "") ||
    booking.endTime <= booking.startTime ||
    !Number.isInteger(booking.participantCount) ||
    booking.participantCount < 1 ||
    !booking.contactName ||
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
}) {
  const router = express.Router();
  const bookingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
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

  router.get("/api/halls", async (_request, response) => {
    const result = await database.query(
      `SELECT id, name, description, capacity, facilities
       FROM conference_halls
       WHERE is_active = TRUE
       ORDER BY name`,
    );
    response.json({ halls: result.rows });
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
      `SELECT b.booking_date::text AS date,
              TO_CHAR(b.start_time, 'HH24:MI') AS "startTime",
              TO_CHAR(b.end_time, 'HH24:MI') AS "endTime",
              h.name AS "hallName"
       FROM bookings b
       JOIN conference_halls h ON h.id = b.hall_id
       WHERE ($1::uuid IS NULL OR b.hall_id = $1)
         AND b.booking_date >= ($2 || '-01')::date
         AND b.booking_date < (($2 || '-01')::date + INTERVAL '1 month')
         AND b.status IN ('pending', 'approved')
       ORDER BY b.booking_date, b.start_time, h.name`,
      [hallId ?? null, month],
    );

    response.set("Cache-Control", "no-store");
    return response.json({ hallId: hallId ?? null, month, slots: result.rows });
  });

  router.post("/api/bookings", bookingLimiter, async (request, response) => {
    const booking = validateBooking(request.body);
    if (!booking) {
      return response.status(400).json({ error: { code: "INVALID_BOOKING" } });
    }

    const hallResult = await database.query(
      `SELECT id, capacity FROM conference_halls WHERE id = $1 AND is_active = TRUE`,
      [booking.hallId],
    );
    const hall = hallResult.rows[0];

    if (!hall || booking.participantCount > hall.capacity) {
      return response.status(400).json({ error: { code: "HALL_UNAVAILABLE" } });
    }

    const reference = randomBytes(32).toString("base64url");
    const referenceHash = createHash("sha256").update(reference).digest("hex");
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${booking.hallId}:${booking.bookingDate}`],
      );
      const conflict = await client.query(
        `SELECT 1
         FROM bookings
         WHERE hall_id = $1
           AND booking_date = $2
           AND status IN ('pending', 'approved')
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

      const insertedBooking = await client.query(
        `INSERT INTO bookings (
           hall_id, reference_hash, meeting_title, purpose, booking_date,
           start_time, end_time, participant_count, contact_name, contact_email,
           contact_phone, additional_requirements
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          booking.hallId,
          referenceHash,
          booking.meetingTitle,
          booking.purpose,
          booking.bookingDate,
          booking.startTime,
          booking.endTime,
          booking.participantCount,
          booking.contactName,
          booking.contactEmail,
          booking.contactPhone,
          booking.additionalRequirements,
        ],
      );
      const bookingId = insertedBooking.rows[0].id;
      await client.query(
        `INSERT INTO notifications (
           booking_id, event_type, channel, recipient_email, scheduled_at
         ) VALUES ($1, 'booking_received', 'email', $2, NOW())`,
        [bookingId, booking.contactEmail],
      );
      if (adminNotificationEmail) {
        await client.query(
          `INSERT INTO notifications (
             booking_id, event_type, channel, recipient_email, scheduled_at
           ) VALUES ($1, 'new_booking_request', 'email', $2, NOW())`,
          [bookingId, adminNotificationEmail],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return response.status(201).json({
      reference,
      status: "pending",
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
      `SELECT status, created_at
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

  return router;
}
