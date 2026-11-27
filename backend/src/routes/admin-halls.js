import { randomUUID } from "node:crypto";
import express from "express";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):(?:00|15|30|45))$/;

function isValidLocalDateTime(value) {
  const match = typeof value === "string" && LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) return false;
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === match[1];
}

function currentSriLankaLocalDateTime() {
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
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function normalizeHallRow(row) {
  if (!row) return row;
  const normalized = {
    ...row,
    facilities:
      typeof row.facilities === "string"
        ? JSON.parse(row.facilities)
        : (row.facilities ?? []),
    isActive: Boolean(row.isActive),
    bookingsPaused: Boolean(row.bookingsPaused),
  };
  if (row.maintenanceWindows !== undefined) {
    const windows =
      typeof row.maintenanceWindows === "string"
        ? JSON.parse(row.maintenanceWindows)
        : (row.maintenanceWindows ?? []);
    normalized.maintenanceWindows = [...windows].sort((a, b) =>
      String(a.startsAt).localeCompare(String(b.startsAt)),
    );
  }
  return normalized;
}

function maintenanceWindowSelection(alias = "mw") {
  return `COALESCE((
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'id', ${alias}.id,
        'startsAt', DATE_FORMAT(${alias}.starts_at, '%Y-%m-%dT%H:%i:%s.000Z'),
        'endsAt', DATE_FORMAT(${alias}.ends_at, '%Y-%m-%dT%H:%i:%s.000Z')
      )
    )
    FROM hall_maintenance_windows ${alias}
    WHERE ${alias}.hall_id = h.id AND ${alias}.ends_at > UTC_TIMESTAMP(3)
  ), JSON_ARRAY()) AS maintenanceWindows`;
}

function validateHall(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    body.description === undefined
      ? ""
      : typeof body.description === "string"
        ? body.description.trim()
        : null;
  const facilities = body.facilities === undefined ? [] : body.facilities;

  if (
    name.length < 2 ||
    name.length > 120 ||
    description === null ||
    description.length > 2000 ||
    !Number.isInteger(body.capacity) ||
    body.capacity < 1 ||
    body.capacity > 10000 ||
    !Array.isArray(facilities) ||
    facilities.length > 30 ||
    facilities.some(
      (facility) =>
        typeof facility !== "string" ||
        facility.trim().length === 0 ||
        facility.trim().length > 80,
    )
  ) {
    return null;
  }

  return {
    name,
    description,
    capacity: body.capacity,
    facilities: facilities.map((facility) => facility.trim()),
  };
}

export function createAdminHallsRouter({
  database,
  frontendOrigin,
  frontendOrigins = [frontendOrigin],
}) {
  const router = express.Router();
  const isAllowedOrigin = (request) => frontendOrigins.includes(request.get("origin"));

  router.get("/api/admin/halls", async (_request, response) => {
    const result = await database.query(
      `SELECT h.id, h.name, h.description, h.capacity, h.facilities,
              h.is_active AS isActive,
              h.bookings_paused AS bookingsPaused,
              ${maintenanceWindowSelection()}
       FROM conference_halls h
       ORDER BY h.is_active DESC, h.name`,
    );
    response.set("Cache-Control", "no-store");
    return response.json({ halls: result.rows.map(normalizeHallRow) });
  });

  router.post("/api/admin/halls", async (request, response) => {
    if (!isAllowedOrigin(request)) {
      return response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED" } });
    }

    const hallDetails = validateHall(request.body);
    if (!hallDetails) {
      return response.status(400).json({ error: { code: "INVALID_HALL" } });
    }

    const hallId = randomUUID();
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO conference_halls (id, name, description, capacity, facilities)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          hallId,
          hallDetails.name,
          hallDetails.description,
          hallDetails.capacity,
          JSON.stringify(hallDetails.facilities),
        ],
      );
      const result = await client.query(
        `SELECT id, name, description, capacity, facilities,
                is_active AS isActive,
                bookings_paused AS bookingsPaused
         FROM conference_halls
         WHERE id = $1`,
        [hallId],
      );
      const hall = normalizeHallRow(result.rows[0]);

      await client.query(
        `INSERT INTO audit_logs (id, admin_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'hall.created', 'conference_hall', $3, $4)`,
        [
          randomUUID(),
          request.admin.id,
          hall.id,
          JSON.stringify({ name: hall.name, capacity: hall.capacity }),
        ],
      );
      await client.query("COMMIT");

      return response.status(201).json({ hall });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  router.patch("/api/admin/halls/:hallId", async (request, response) => {
    if (!isAllowedOrigin(request)) {
      return response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED" } });
    }

    if (!UUID_PATTERN.test(request.params.hallId)) {
      return response.status(400).json({ error: { code: "INVALID_HALL" } });
    }

    const hallDetails = validateHall(request.body);
    if (!hallDetails) {
      return response.status(400).json({ error: { code: "INVALID_HALL" } });
    }

    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT id
         FROM conference_halls
         WHERE id = $1
         FOR UPDATE`,
        [request.params.hallId],
      );
      if (!current.rows[0]) {
        await client.query("ROLLBACK");
        return response.status(404).json({ error: { code: "HALL_NOT_FOUND" } });
      }

      const overCapacity = await client.query(
        `SELECT 1
         FROM bookings
         WHERE hall_id = $1
           AND status IN ('pending', 'approved')
           AND TIMESTAMP(booking_date, end_time) > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)
           AND participant_count > $2
         LIMIT 1`,
        [request.params.hallId, hallDetails.capacity],
      );
      if (overCapacity.rowCount > 0) {
        await client.query("ROLLBACK");
        return response.status(409).json({
          error: { code: "HALL_CAPACITY_CONFLICT" },
        });
      }

      await client.query(
        `UPDATE conference_halls
         SET name = $1, description = $2, capacity = $3, facilities = $4,
             updated_at = UTC_TIMESTAMP(3)
         WHERE id = $5`,
        [
          hallDetails.name,
          hallDetails.description,
          hallDetails.capacity,
          JSON.stringify(hallDetails.facilities),
          request.params.hallId,
        ],
      );
      const result = await client.query(
        `SELECT id, name, description, capacity, facilities,
                is_active AS isActive,
                bookings_paused AS bookingsPaused
         FROM conference_halls
         WHERE id = $1`,
        [request.params.hallId],
      );
      const hall = normalizeHallRow(result.rows[0]);
      await client.query(
        `INSERT INTO audit_logs (id, admin_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'hall.updated', 'conference_hall', $3, $4)`,
        [
          randomUUID(),
          request.admin.id,
          hall.id,
          JSON.stringify({
            name: hall.name,
            capacity: hall.capacity,
            facilities: hall.facilities,
          }),
        ],
      );
      await client.query("COMMIT");

      return response.json({ hall });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  router.patch("/api/admin/halls/:hallId/status", async (request, response) => {
    if (!isAllowedOrigin(request)) {
      return response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED" } });
    }

    if (!UUID_PATTERN.test(request.params.hallId)) {
      return response.status(400).json({ error: { code: "INVALID_HALL" } });
    }
    if (typeof request.body?.isActive !== "boolean") {
      return response.status(400).json({ error: { code: "INVALID_HALL_STATUS" } });
    }

    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const updateResult = await client.query(
        `UPDATE conference_halls
         SET is_active = $1,
             updated_at = UTC_TIMESTAMP(3)
         WHERE id = $2`,
        [request.body.isActive, request.params.hallId],
      );
      if (updateResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return response.status(404).json({ error: { code: "HALL_NOT_FOUND" } });
      }
      const result = await client.query(
        `SELECT id, name, description, capacity, facilities,
                is_active AS isActive,
                bookings_paused AS bookingsPaused
         FROM conference_halls
         WHERE id = $1`,
        [request.params.hallId],
      );
      const hall = normalizeHallRow(result.rows[0]);

      const action = hall.isActive ? "hall.activated" : "hall.deactivated";
      await client.query(
        `INSERT INTO audit_logs (id, admin_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, 'conference_hall', $4, $5)`,
        [
          randomUUID(),
          request.admin.id,
          action,
          hall.id,
          JSON.stringify({ name: hall.name }),
        ],
      );
      await client.query("COMMIT");

      return response.json({ hall });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  router.patch("/api/admin/halls/:hallId/maintenance", async (request, response) => {
    if (!isAllowedOrigin(request)) {
      return response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED" } });
    }

    if (!UUID_PATTERN.test(request.params.hallId)) {
      return response.status(400).json({ error: { code: "INVALID_HALL" } });
    }
    if (typeof request.body?.bookingsPaused !== "boolean") {
      return response.status(400).json({ error: { code: "INVALID_MAINTENANCE_STATUS" } });
    }

    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const updateResult = await client.query(
        `UPDATE conference_halls
         SET bookings_paused = $1,
             updated_at = UTC_TIMESTAMP(3)
         WHERE id = $2`,
        [request.body.bookingsPaused, request.params.hallId],
      );
      if (updateResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return response.status(404).json({ error: { code: "HALL_NOT_FOUND" } });
      }
      const result = await client.query(
        `SELECT id, name, description, capacity, facilities,
                is_active AS isActive,
                bookings_paused AS bookingsPaused
         FROM conference_halls
         WHERE id = $1`,
        [request.params.hallId],
      );
      const hall = normalizeHallRow(result.rows[0]);

      const action = hall.bookingsPaused
        ? "hall.maintenance_paused"
        : "hall.maintenance_resumed";
      await client.query(
        `INSERT INTO audit_logs (id, admin_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, 'conference_hall', $4, $5)`,
        [
          randomUUID(),
          request.admin.id,
          action,
          hall.id,
          JSON.stringify({ name: hall.name }),
        ],
      );
      await client.query("COMMIT");

      return response.json({ hall });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  router.post("/api/admin/halls/:hallId/maintenance-windows", async (request, response) => {
    if (!isAllowedOrigin(request)) {
      return response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED" } });
    }
    if (!UUID_PATTERN.test(request.params.hallId)) {
      return response.status(400).json({ error: { code: "INVALID_HALL" } });
    }
    const { startsAt, endsAt, allowBookingConflicts = false } = request.body ?? {};
    if (
      !isValidLocalDateTime(startsAt) ||
      !isValidLocalDateTime(endsAt) ||
      startsAt <= currentSriLankaLocalDateTime() ||
      endsAt <= startsAt ||
      typeof allowBookingConflicts !== "boolean"
    ) {
      return response.status(400).json({ error: { code: "INVALID_MAINTENANCE_WINDOW" } });
    }

    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const hallResult = await client.query(
        `SELECT id, name FROM conference_halls WHERE id = $1 FOR UPDATE`,
        [request.params.hallId],
      );
      if (!hallResult.rows[0]) {
        await client.query("ROLLBACK");
        return response.status(404).json({ error: { code: "HALL_NOT_FOUND" } });
      }

      const conflicts = await client.query(
        `SELECT DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS date,
                TIME_FORMAT(b.start_time, '%H:%i') AS startTime,
                TIME_FORMAT(b.end_time, '%H:%i') AS endTime,
                b.meeting_title AS meetingTitle,
                b.contact_name AS contactName
         FROM bookings b
         WHERE b.hall_id = $1
           AND b.status IN ('pending', 'approved')
           AND TIMESTAMP(b.booking_date, b.start_time) < STR_TO_DATE(REPLACE($3, 'T', ' '), '%Y-%m-%d %H:%i')
           AND TIMESTAMP(b.booking_date, b.end_time) > STR_TO_DATE(REPLACE($2, 'T', ' '), '%Y-%m-%d %H:%i')
         ORDER BY b.booking_date, b.start_time`,
        [request.params.hallId, startsAt, endsAt],
      );
      if (conflicts.rowCount > 0 && !allowBookingConflicts) {
        await client.query("ROLLBACK");
        return response.status(409).json({
          error: {
            code: "MAINTENANCE_BOOKING_CONFLICT",
            details: { bookings: conflicts.rows },
          },
        });
      }

      const overlappingWindow = await client.query(
        `SELECT 1
         FROM hall_maintenance_windows
         WHERE hall_id = $1
           AND starts_at < DATE_SUB(STR_TO_DATE(REPLACE($3, 'T', ' '), '%Y-%m-%d %H:%i'), INTERVAL 330 MINUTE)
           AND ends_at > DATE_SUB(STR_TO_DATE(REPLACE($2, 'T', ' '), '%Y-%m-%d %H:%i'), INTERVAL 330 MINUTE)
         LIMIT 1`,
        [request.params.hallId, startsAt, endsAt],
      );
      if (overlappingWindow.rowCount > 0) {
        await client.query("ROLLBACK");
        return response.status(409).json({
          error: { code: "MAINTENANCE_WINDOW_CONFLICT" },
        });
      }

      const windowId = randomUUID();
      await client.query(
        `INSERT INTO hall_maintenance_windows (id, hall_id, starts_at, ends_at, created_by)
         VALUES (
           $1,
           $2,
           DATE_SUB(STR_TO_DATE(REPLACE($3, 'T', ' '), '%Y-%m-%d %H:%i'), INTERVAL 330 MINUTE),
           DATE_SUB(STR_TO_DATE(REPLACE($4, 'T', ' '), '%Y-%m-%d %H:%i'), INTERVAL 330 MINUTE),
           $5
         )`,
        [windowId, request.params.hallId, startsAt, endsAt, request.admin.id],
      );
      const inserted = await client.query(
        `SELECT id,
                DATE_FORMAT(starts_at, '%Y-%m-%dT%H:%i:%s.000Z') AS startsAt,
                DATE_FORMAT(ends_at, '%Y-%m-%dT%H:%i:%s.000Z') AS endsAt
         FROM hall_maintenance_windows
         WHERE id = $1`,
        [windowId],
      );
      const windowRow = inserted.rows[0];
      await client.query(
        `INSERT INTO audit_logs (id, admin_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'hall.maintenance_scheduled', 'conference_hall', $3, $4)`,
        [
          randomUUID(),
          request.admin.id,
          request.params.hallId,
          JSON.stringify({ startsAt, endsAt, conflictCount: conflicts.rowCount }),
        ],
      );
      await client.query("COMMIT");
      return response.status(201).json({ window: windowRow, conflicts: conflicts.rows });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  router.delete("/api/admin/halls/:hallId/maintenance-windows/:windowId", async (request, response) => {
    if (!isAllowedOrigin(request)) {
      return response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED" } });
    }
    if (
      !UUID_PATTERN.test(request.params.hallId) ||
      !UUID_PATTERN.test(request.params.windowId)
    ) {
      return response.status(400).json({ error: { code: "INVALID_HALL" } });
    }

    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT id,
                DATE_FORMAT(starts_at, '%Y-%m-%dT%H:%i:%s.000Z') AS startsAt,
                DATE_FORMAT(ends_at, '%Y-%m-%dT%H:%i:%s.000Z') AS endsAt
         FROM hall_maintenance_windows
         WHERE id = $1 AND hall_id = $2 AND ends_at > UTC_TIMESTAMP(3)
         FOR UPDATE`,
        [request.params.windowId, request.params.hallId],
      );
      if (!result.rows[0]) {
        await client.query("ROLLBACK");
        return response.status(404).json({ error: { code: "MAINTENANCE_WINDOW_NOT_FOUND" } });
      }
      await client.query(
        `DELETE FROM hall_maintenance_windows WHERE id = $1`,
        [request.params.windowId],
      );
      await client.query(
        `INSERT INTO audit_logs (id, admin_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, 'hall.maintenance_cancelled', 'conference_hall', $3, $4)`,
        [
          randomUUID(),
          request.admin.id,
          request.params.hallId,
          JSON.stringify({ windowId: request.params.windowId }),
        ],
      );
      await client.query("COMMIT");
      return response.json({ window: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  return router;
}
