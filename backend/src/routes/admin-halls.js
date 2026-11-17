import express from "express";

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

export function createAdminHallsRouter({ database, frontendOrigin }) {
  const router = express.Router();

  router.post("/api/admin/halls", async (request, response) => {
    if (request.get("origin") !== frontendOrigin) {
      return response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED" } });
    }

    const hallDetails = validateHall(request.body);
    if (!hallDetails) {
      return response.status(400).json({ error: { code: "INVALID_HALL" } });
    }

    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO conference_halls (name, description, capacity, facilities)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, description, capacity, facilities`,
        [
          hallDetails.name,
          hallDetails.description,
          hallDetails.capacity,
          hallDetails.facilities,
        ],
      );
      const hall = result.rows[0];

      await client.query(
        `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
         VALUES ($1, 'hall.created', 'conference_hall', $2, $3)`,
        [
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

  return router;
}
