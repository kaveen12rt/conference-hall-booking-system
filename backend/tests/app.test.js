import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app/app.js";
import { decryptManageToken } from "../src/notifications/manage-token.js";

describe("API foundation", { concurrency: false }, () => {
  let server;
  let baseUrl;
  let databaseAvailable;
  let queries;
  let bookingReferenceHash;
  let bookingManageTokenHash;
  let bookingManageToken;
  let bookingContactDesignation;
  let bookingManageTokenActive;
  let bookingConflict;
  let sessionCookie;
  let hallCreationAuditRecorded;
  let hallActive;
  let hallBookingsPaused;
  let hallCapacityConflict;
  let maintenanceBookingConflict;
  let maintenanceWindowConflict;
  let scheduledMaintenanceWindows;
  let hallAuditActions;
  let bookingStatus;
  let bookingInsertSql;
  let bookingPurpose;
  let bookingUpdateParams;
  let bookingConflictQuery;
  let bookingMoreThanHourRemaining;
  let bookingUpcoming;
  let notificationsQueued;
  const admin = {
    id: "6bcf9b37-e6f1-455a-a564-12988a670d25",
    username: "test_admin",
    token_version: 0,
  };
  const hall = {
    id: "6939af95-ad10-44d3-a224-7e6a5586bfd8",
    capacity: 20,
  };
  const bookingId = "4e8fb3ea-1429-4e49-a3c1-523c207a91e8";
  const adminPassword = "correct horse battery staple";
  const authTokenSecret = "test-secret-with-more-than-thirty-two-bytes";

  before(async () => {
    databaseAvailable = false;
    bookingConflict = false;
    hallCreationAuditRecorded = false;
    hallActive = true;
    hallBookingsPaused = false;
    hallCapacityConflict = false;
    maintenanceBookingConflict = false;
    maintenanceWindowConflict = false;
    scheduledMaintenanceWindows = [];
    hallAuditActions = [];
    bookingStatus = "pending";
    bookingInsertSql = "";
    bookingPurpose = undefined;
    bookingUpdateParams = undefined;
    bookingConflictQuery = "";
    bookingMoreThanHourRemaining = true;
    bookingUpcoming = true;
    bookingManageTokenActive = false;
    notificationsQueued = [];
    queries = [];
    admin.password_hash = await bcrypt.hash(adminPassword, 4);
    const database = {
      query: async (sql, params = []) => {
        queries.push({ sql, params });
        if (sql === "SELECT 1" && !databaseAvailable) {
          throw new Error("Database unavailable");
        }
        if (sql === "SELECT 1") {
          return { rows: [{ "?column?": 1 }] };
        }
        if (sql.includes("password_hash") && sql.includes("FROM admins")) {
          return { rows: [{ ...admin }] };
        }
        if (sql.includes("token_version") && sql.includes("FROM admins")) {
          return { rows: [admin] };
        }
        if (sql.includes("UPDATE admins") && sql.includes("token_version")) {
          if (admin.token_version !== params[1]) {
            return { rows: [] };
          }
          admin.token_version += 1;
          return { rows: [{ id: admin.id }] };
        }
        if (sql.includes("INSERT INTO audit_logs")) {
          return { rows: [] };
        }
        if (sql.includes("COUNT(*) FILTER") && sql.includes("GROUP BY b.booking_date")) {
          return {
            rows: [
              {
                date: "2026-12-01",
                totalRequests: 3,
                completedMeetings: 2,
                scheduledMeetings: 0,
                pendingRequests: 1,
                closedRequests: 0,
              },
              {
                date: "2026-12-02",
                totalRequests: 1,
                completedMeetings: 0,
                scheduledMeetings: 1,
                pendingRequests: 0,
                closedRequests: 0,
              },
            ],
          };
        }
        if (
          sql.includes("COUNT(*) OVER()") &&
          sql.includes("NOW() - INTERVAL '24 hours'")
        ) {
          return {
            rows: [{
              id: bookingId,
              hallId: hall.id,
              hallName: "Main Hall",
              date: "2026-12-01",
              startTime: "09:00",
              endTime: "10:00",
              meetingTitle: "Planning meeting",
              contactName: "Example Contact",
              contactDesignation: "Senior Officer",
              status: "approved",
              submittedAt: "2026-11-18T06:00:00.000Z",
              totalCount: "1",
            }],
          };
        }
        if (sql.includes("manage_token_hash") && sql.includes("FROM bookings b")) {
          if (!bookingManageTokenActive || params[0] !== bookingManageTokenHash) {
            return { rows: [] };
          }
          return {
            rows: [{
              hallId: hall.id,
              meetingTitle: "Planning meeting",
              purpose: "Project planning",
              bookingDate: "2026-12-01",
              startTime: "09:00",
              endTime: "10:00",
              participantCount: 12,
              contactName: "Example Contact",
              contactDesignation: bookingContactDesignation,
              contactEmail: "contact@example.test",
              contactPhone: "+94112223344",
              additionalRequirements: "",
              status: bookingStatus,
              moreThanHourRemaining: bookingMoreThanHourRemaining,
            }],
          };
        }
        if (sql.includes("FROM conference_halls WHERE id = $1")) {
          return {
            rows:
              (sql.includes("is_active = TRUE") && !hallActive) ||
              (sql.includes("bookings_paused = FALSE") && hallBookingsPaused)
                ? []
                : [hall],
          };
        }
        if (sql.includes("FROM conference_halls") && sql.includes('AS "isActive"')) {
          return {
            rows: [{
              id: "72a8e17a-7fd4-4d3e-a363-c5b5e5eeae50",
              name: "Main Conference Hall",
              description: "Large meeting space",
              capacity: 250,
              facilities: ["Projector", "Wi-Fi"],
              isActive: hallActive,
              bookingsPaused: hallBookingsPaused,
              maintenanceWindows: scheduledMaintenanceWindows,
            }],
          };
        }
        if (sql.includes("FROM bookings b") && sql.includes("meeting_title")) {
          return {
            rows: [{
              id: "4e8fb3ea-1429-4e49-a3c1-523c207a91e8",
              hallId: hall.id,
              hallName: "Main Hall",
              date: "2026-12-01",
              startTime: "09:00",
              endTime: "10:00",
              meetingTitle: "Planning meeting",
              participantCount: 12,
              contactName: "Example Contact",
              contactDesignation: "Senior Officer",
              contactEmail: "contact@example.test",
              contactPhone: "+94112223344",
              status: bookingStatus,
            }],
          };
        }
        if (sql.includes("status IN ('pending', 'approved')")) {
          return {
            rows: [{
              date: "2026-12-01",
              startTime: "09:00",
              endTime: "10:00",
              hallName: "Main Hall",
              status: "reserved",
            }],
          };
        }
        if (sql.includes("SELECT 1") && sql.includes("FROM bookings")) {
          return { rowCount: bookingConflict ? 1 : 0, rows: bookingConflict ? [{ "?column?": 1 }] : [] };
        }
        if (sql.includes("INSERT INTO bookings")) {
          bookingInsertSql = sql;
          bookingReferenceHash = params[1];
          bookingContactDesignation = params[9];
          bookingManageTokenHash = params[13];
          return { rows: [] };
        }
        if (sql.includes("FROM bookings") && sql.includes("reference_hash")) {
          if (params[0] === bookingReferenceHash) {
            return { rows: [{ status: bookingStatus, created_at: "2026-11-17T00:00:00.000Z" }] };
          }
          return { rows: [] };
        }
        if (sql.includes("FROM conference_halls") && sql.includes("is_active = TRUE")) {
          return {
            rows: hallActive && !(sql.includes("bookings_paused = FALSE") && hallBookingsPaused)
              ? [{
                  ...hall,
                  name: "Main Hall",
                  description: "",
                  facilities: [],
                  maintenanceWindows: scheduledMaintenanceWindows,
                }]
              : [],
          };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
      connect: async () => ({
        query: async (sql, params = []) => {
          if (sql.includes("FROM bookings") && sql.includes("start_time < $")) {
            bookingConflictQuery = sql;
          }
          if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
            return { rows: [] };
          }
          if (sql.includes("manage_token_hash") && sql.includes("FROM bookings")) {
            if (!bookingManageTokenActive || params[0] !== bookingManageTokenHash) {
              return { rows: [] };
            }
            return {
              rows: [{
                id: bookingId,
                hallId: hall.id,
                meetingTitle: "Planning meeting",
                purpose: "Project planning",
                bookingDate: "2026-12-01",
                startTime: "09:00",
                endTime: "10:00",
                participantCount: 12,
                contactName: "Example Contact",
                contactDesignation: bookingContactDesignation,
                contactEmail: "contact@example.test",
                contactPhone: "+94112223344",
                additionalRequirements: "",
                status: bookingStatus,
                moreThanHourRemaining: bookingMoreThanHourRemaining,
              }],
            };
          }
          if (sql.includes("FOR UPDATE") && sql.includes("FROM bookings")) {
            return {
              rows: [{
                id: bookingId,
                hallId: hall.id,
                contactDesignation: bookingContactDesignation,
                contactEmail: "contact@example.test",
                status: bookingStatus,
                date: "2026-12-01",
                startTime: "09:00:00",
                endTime: "10:00:00",
              }],
            };
          }
          if (sql.includes("AS upcoming")) {
            return { rows: [{ upcoming: bookingUpcoming }] };
          }
          if (sql.includes("pg_advisory_xact_lock")) {
            return { rows: [] };
          }
          if (sql.includes("participant_count > $2")) {
            return { rowCount: hallCapacityConflict ? 1 : 0, rows: hallCapacityConflict ? [{ "?column?": 1 }] : [] };
          }
          if (sql.includes("hall_maintenance_windows")) {
            if (sql.includes("DELETE FROM hall_maintenance_windows")) {
              scheduledMaintenanceWindows = [];
              return {
                rows: [{
                  id: params[0],
                  startsAt: "2099-12-01T04:30:00.000Z",
                  endsAt: "2099-12-01T05:30:00.000Z",
                }],
              };
            }
            if (sql.includes("INSERT INTO hall_maintenance_windows")) {
              const window = {
                id: "872a8e17-7fd4-4d3e-a363-c5b5e5eeae50",
                startsAt: "2099-12-01T04:30:00.000Z",
                endsAt: "2099-12-01T05:30:00.000Z",
              };
              scheduledMaintenanceWindows = [window];
              return { rows: [window] };
            }
            return {
              rowCount: maintenanceWindowConflict ? 1 : 0,
              rows: maintenanceWindowConflict ? [{ "?column?": 1 }] : [],
            };
          }
          if (
            sql.includes("FROM bookings b") &&
            sql.includes("b.contact_name") &&
            sql.includes("b.status IN")
          ) {
            const rows = maintenanceBookingConflict
              ? [{
                  date: "2099-12-01",
                  startTime: "10:00",
                  endTime: "10:30",
                  meetingTitle: "Existing meeting",
                  contactName: "Example Contact",
                }]
              : [];
            return { rowCount: rows.length, rows };
          }
          if (sql.includes("SELECT id") && sql.includes("FROM conference_halls") && sql.includes("FOR UPDATE")) {
            return { rows: [{ id: params[0] }] };
          }
          if (sql.includes("FROM conference_halls") && sql.includes("is_active = TRUE")) {
            const pausedForNewBooking =
              sql.includes("bookings_paused = FALSE") &&
              !sql.includes("OR id = $2") &&
              hallBookingsPaused;
            return { rows: hallActive && !pausedForNewBooking ? [{ ...hall }] : [] };
          }
          if (sql.includes("id <> $1") && sql.includes("start_time < $5")) {
            return { rowCount: bookingConflict ? 1 : 0, rows: [] };
          }
          if (sql.includes("FROM bookings") && sql.includes("start_time < $4")) {
            return {
              rowCount: bookingConflict ? 1 : 0,
              rows: bookingConflict ? [{ "?column?": 1 }] : [],
            };
          }
          if (sql.includes("SET status = 'cancelled'")) {
            bookingStatus = "cancelled";
            bookingManageTokenActive = false;
            return { rows: [] };
          }
          if (sql.includes("UPDATE bookings") && sql.includes("SET hall_id = $2")) {
            bookingStatus = params[9];
            bookingUpdateParams = params;
            return { rows: [] };
          }
          if (sql.includes("UPDATE bookings") && sql.includes("SET status = $2")) {
            bookingStatus = params[1];
            if (params[1] === "cancelled" || params[1] === "rejected") {
              bookingManageTokenActive = false;
            } else if (params[1] === "approved") {
              bookingManageTokenHash = params[2];
              bookingManageTokenActive = true;
            }
            return { rows: [] };
          }
          if (sql.includes("INSERT INTO bookings")) {
            bookingInsertSql = sql;
            bookingReferenceHash = params[1];
            bookingPurpose = params[3];
            bookingContactDesignation = params[9];
            bookingManageTokenHash = params[13];
            bookingManageTokenActive = true;
            bookingStatus = "approved";
            return { rows: [{ id: bookingId }] };
          }
          if (sql.includes("INSERT INTO notifications")) {
            notificationsQueued.push({ sql, params });
            return { rows: [] };
          }
          if (sql.includes("UPDATE notifications")) {
            notificationsQueued.push({ sql, params });
            return { rows: [] };
          }
          if (sql.includes("UPDATE admins") && sql.includes("password_hash")) {
            admin.password_hash = params[0];
            admin.token_version += 1;
            return { rows: [{ ...admin }] };
          }
          if (sql.includes("INSERT INTO audit_logs")) {
            if (sql.includes("'hall.created'")) {
              hallCreationAuditRecorded = true;
            } else if (sql.includes("'hall.updated'")) {
              hallAuditActions.push("hall.updated");
            } else if (sql.includes("'hall.maintenance_scheduled'")) {
              hallAuditActions.push("hall.maintenance_scheduled");
            } else if (sql.includes("'hall.maintenance_cancelled'")) {
              hallAuditActions.push("hall.maintenance_cancelled");
            } else if (params[1]?.startsWith("hall.")) {
              hallAuditActions.push(params[1]);
            }
            return { rows: [] };
          }
          if (sql.includes("UPDATE conference_halls") && sql.includes("SET is_active")) {
            hallActive = params[0];
            return {
              rows: [{
                id: params[1],
                name: "Main Conference Hall",
                description: "Large meeting space",
                capacity: 250,
                facilities: ["Projector", "Wi-Fi"],
                isActive: hallActive,
                bookingsPaused: hallBookingsPaused,
              }],
            };
          }
          if (sql.includes("UPDATE conference_halls") && sql.includes("SET bookings_paused")) {
            hallBookingsPaused = params[0];
            return {
              rows: [{
                id: params[1],
                name: "Main Conference Hall",
                description: "Large meeting space",
                capacity: 250,
                facilities: ["Projector", "Wi-Fi"],
                isActive: hallActive,
                bookingsPaused: hallBookingsPaused,
              }],
            };
          }
          if (sql.includes("UPDATE conference_halls") && sql.includes("SET name")) {
            return {
              rows: [{
                id: params[4],
                name: params[0],
                description: params[1],
                capacity: params[2],
                facilities: params[3],
                isActive: hallActive,
                bookingsPaused: hallBookingsPaused,
              }],
            };
          }
          if (sql.includes("INSERT INTO conference_halls")) {
            hallActive = true;
            return {
              rows: [{
                id: "72a8e17a-7fd4-4d3e-a363-c5b5e5eeae50",
                name: params[0],
                description: params[1],
                capacity: params[2],
                facilities: params[3],
                isActive: hallActive,
                bookingsPaused: false,
              }],
            };
          }
          throw new Error(`Unexpected transaction query: ${sql}`);
        },
        release() {},
      }),
    };
    server = createApp({
      database,
      authTokenSecret,
      adminNotificationEmail: "office@example.test",
    }).listen(0, "127.0.0.1");
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
    assert.deepEqual(queries[0], { sql: "SELECT 1", params: [] });
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

  it("does not provide public registration and protects admin APIs", async () => {
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
    });
    const adminEndpoint = await fetch(`${baseUrl}/api/admin/bookings`);
    const adminCalendar = await fetch(
      `${baseUrl}/api/admin/calendar/bookings?month=2026-12`,
    );
    const monthlyReport = await fetch(
      `${baseUrl}/api/admin/reports/monthly?month=2026-12`,
    );
    const adminNotifications = await fetch(`${baseUrl}/api/admin/notifications`);
    const adminHallCreate = await fetch(`${baseUrl}/api/admin/halls`, {
      method: "POST",
    });
    const adminHallList = await fetch(`${baseUrl}/api/admin/halls`);

    assert.equal(registration.status, 404);
    assert.equal(adminEndpoint.status, 401);
    assert.equal(adminCalendar.status, 401);
    assert.equal(monthlyReport.status, 401);
    assert.equal(adminNotifications.status, 401);
    assert.equal(adminHallCreate.status, 401);
    assert.equal(adminHallList.status, 401);
  });

  it("authenticates an admin and sets a protected session cookie", async () => {
    const emailLogin = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:5173",
      },
      body: JSON.stringify({ email: "admin@example.test", password: adminPassword }),
    });
    assert.equal(emailLogin.status, 400);

    const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:5173",
      },
      body: JSON.stringify({ username: admin.username, password: adminPassword }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      admin: { id: admin.id, username: admin.username },
      emailDeliveryConfigured: false,
    });
    const cookie = response.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /Path=\/api\/admin/i);

    sessionCookie = cookie.split(";")[0];
    const profile = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(profile.status, 200);
    assert.deepEqual(await profile.json(), {
      admin: { id: admin.id, username: admin.username },
      emailDeliveryConfigured: false,
    });

    const notifications = await fetch(`${baseUrl}/api/admin/notifications`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(notifications.status, 200);
    assert.equal(notifications.headers.get("cache-control"), "no-store");
    assert.deepEqual(await notifications.json(), {
      recentBookingCount: 1,
      recentBookings: [{
        id: bookingId,
        hallId: hall.id,
        hallName: "Main Hall",
        date: "2026-12-01",
        startTime: "09:00",
        endTime: "10:00",
        meetingTitle: "Planning meeting",
        contactName: "Example Contact",
        contactDesignation: "Senior Officer",
        status: "approved",
        submittedAt: "2026-11-18T06:00:00.000Z",
      }],
    });

    const report = await fetch(
      `${baseUrl}/api/admin/reports/monthly?month=2026-12`,
      { headers: { cookie: sessionCookie } },
    );
    assert.equal(report.status, 200);
    assert.equal(report.headers.get("cache-control"), "no-store");
    assert.deepEqual(await report.json(), {
      month: "2026-12",
      days: [
        {
          date: "2026-12-01",
          totalRequests: 3,
          completedMeetings: 2,
          scheduledMeetings: 0,
          pendingRequests: 1,
          closedRequests: 0,
        },
        {
          date: "2026-12-02",
          totalRequests: 1,
          completedMeetings: 0,
          scheduledMeetings: 1,
          pendingRequests: 0,
          closedRequests: 0,
        },
      ],
    });
    const recentBookingsQuery = queries.find(({ sql }) =>
      sql.includes("COUNT(*) OVER()") &&
      sql.includes("NOW() - INTERVAL '24 hours'"),
    );
    assert.ok(recentBookingsQuery);
    assert.match(recentBookingsQuery.sql, /b\.status IN \('approved', 'cancelled', 'rejected'\)/);
    const invalidReport = await fetch(
      `${baseUrl}/api/admin/reports/monthly?month=2026-13`,
      { headers: { cookie: sessionCookie } },
    );
    assert.equal(invalidReport.status, 400);
    assert.deepEqual(await invalidReport.json(), {
      error: { code: "INVALID_REPORT_MONTH" },
    });
    const reportQuery = queries.find(({ sql }) =>
      sql.includes("COUNT(*) FILTER") && sql.includes("GROUP BY b.booking_date"),
    );
    assert.deepEqual(reportQuery.params, ["2026-12-01", "2027-01-01"]);
    assert.match(reportQuery.sql, /Asia\/Colombo/);

    const calendar = await fetch(
      `${baseUrl}/api/admin/calendar/bookings?month=2026-12`,
      { headers: { cookie: sessionCookie } },
    );
    assert.equal(calendar.status, 200);
    const calendarBody = await calendar.json();
    assert.equal(calendarBody.bookings[0].contactEmail, "contact@example.test");
    assert.equal(calendarBody.bookings[0].contactDesignation, "Senior Officer");
    assert.equal(calendar.headers.get("cache-control"), "no-store");
    const calendarQuery = [...queries].reverse().find(({ sql }) =>
      sql.includes("FROM bookings b") && sql.includes("b.booking_date >="),
    );
    assert.match(calendarQuery.sql, /THEN 'completed'/);

    const logout = await fetch(`${baseUrl}/api/admin/auth/logout`, {
      method: "POST",
      headers: {
        cookie: sessionCookie,
        origin: "http://127.0.0.1:5173",
      },
    });
    assert.equal(logout.status, 204);

    const revokedProfile = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(revokedProfile.status, 401);
  });

  it("creates and manages halls only for authenticated same-origin admins", async () => {
    const login = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:5173",
      },
      body: JSON.stringify({ username: admin.username, password: adminPassword }),
    });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const hallBody = {
      name: "  Main Conference Hall  ",
      description: "Large meeting space",
      capacity: 250,
      facilities: [" Projector ", "Wi-Fi"],
    };

    const wrongOrigin = await fetch(`${baseUrl}/api/admin/halls`, {
      method: "POST",
      headers: {
        cookie,
        origin: "https://example.test",
        "content-type": "application/json",
      },
      body: JSON.stringify(hallBody),
    });
    assert.equal(wrongOrigin.status, 403);

    const invalid = await fetch(`${baseUrl}/api/admin/halls`, {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...hallBody, capacity: 0 }),
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), {
      error: { code: "INVALID_HALL" },
    });

    const created = await fetch(`${baseUrl}/api/admin/halls`, {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify(hallBody),
    });

    assert.equal(created.status, 201);
    assert.deepEqual((await created.json()).hall, {
      id: "72a8e17a-7fd4-4d3e-a363-c5b5e5eeae50",
      name: "Main Conference Hall",
      description: "Large meeting space",
      capacity: 250,
      facilities: ["Projector", "Wi-Fi"],
      isActive: true,
      bookingsPaused: false,
    });
    assert.equal(hallCreationAuditRecorded, true);

    const listed = await fetch(`${baseUrl}/api/admin/halls`, {
      headers: { cookie },
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.headers.get("cache-control"), "no-store");
    assert.equal((await listed.json()).halls[0].isActive, true);

    const hallId = "72a8e17a-7fd4-4d3e-a363-c5b5e5eeae50";
    const unauthorizedEdit = await fetch(`${baseUrl}/api/admin/halls/${hallId}`, {
      method: "PATCH",
      headers: {
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify(hallBody),
    });
    assert.equal(unauthorizedEdit.status, 401);

    const wrongOriginEdit = await fetch(`${baseUrl}/api/admin/halls/${hallId}`, {
      method: "PATCH",
      headers: {
        cookie,
        origin: "https://example.test",
        "content-type": "application/json",
      },
      body: JSON.stringify(hallBody),
    });
    assert.equal(wrongOriginEdit.status, 403);

    const updatedHall = await fetch(`${baseUrl}/api/admin/halls/${hallId}`, {
      method: "PATCH",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...hallBody,
        name: "Updated Conference Hall",
        capacity: 180,
      }),
    });
    assert.equal(updatedHall.status, 200);
    assert.equal((await updatedHall.json()).hall.name, "Updated Conference Hall");
    assert.ok(hallAuditActions.includes("hall.updated"));

    hallCapacityConflict = true;
    const rejectedCapacityReduction = await fetch(`${baseUrl}/api/admin/halls/${hallId}`, {
      method: "PATCH",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...hallBody, capacity: 10 }),
    });
    hallCapacityConflict = false;
    assert.equal(rejectedCapacityReduction.status, 409);
    assert.deepEqual(await rejectedCapacityReduction.json(), {
      error: { code: "HALL_CAPACITY_CONFLICT" },
    });

    const wrongOriginStatus = await fetch(`${baseUrl}/api/admin/halls/${hallId}/status`, {
      method: "PATCH",
      headers: {
        cookie,
        origin: "https://example.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(wrongOriginStatus.status, 403);

    const invalidStatus = await fetch(`${baseUrl}/api/admin/halls/${hallId}/status`, {
      method: "PATCH",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ isActive: "false" }),
    });
    assert.equal(invalidStatus.status, 400);
    assert.deepEqual(await invalidStatus.json(), {
      error: { code: "INVALID_HALL_STATUS" },
    });

    const deactivated = await fetch(`${baseUrl}/api/admin/halls/${hallId}/status`, {
      method: "PATCH",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(deactivated.status, 200);
    assert.equal((await deactivated.json()).hall.isActive, false);
    assert.deepEqual(hallAuditActions, ["hall.updated", "hall.deactivated"]);
    assert.deepEqual(
      (await (await fetch(`${baseUrl}/api/halls`)).json()).halls,
      [],
    );
    const inactiveHallBooking = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hallId,
        meetingTitle: "Meeting in inactive hall",
        bookingDate: "2026-12-01",
        startTime: "09:00",
        endTime: "10:00",
        participantCount: 12,
        contactName: "Example Contact",
        contactEmail: "contact@example.test",
        contactPhone: "+94112223344",
      }),
    });
    assert.equal(inactiveHallBooking.status, 400);
    assert.deepEqual(await inactiveHallBooking.json(), {
      error: { code: "HALL_UNAVAILABLE" },
    });

    const reactivated = await fetch(`${baseUrl}/api/admin/halls/${hallId}/status`, {
      method: "PATCH",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ isActive: true }),
    });
    assert.equal(reactivated.status, 200);
    assert.equal((await reactivated.json()).hall.isActive, true);
    assert.deepEqual(hallAuditActions, [
      "hall.updated",
      "hall.deactivated",
      "hall.activated",
    ]);

    const invalidMaintenance = await fetch(`${baseUrl}/api/admin/halls/${hallId}/maintenance`, {
      method: "PATCH",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ bookingsPaused: "true" }),
    });
    assert.equal(invalidMaintenance.status, 400);
    assert.deepEqual(await invalidMaintenance.json(), {
      error: { code: "INVALID_MAINTENANCE_STATUS" },
    });

    const paused = await fetch(`${baseUrl}/api/admin/halls/${hallId}/maintenance`, {
      method: "PATCH",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ bookingsPaused: true }),
    });
    assert.equal(paused.status, 200);
    assert.equal((await paused.json()).hall.bookingsPaused, true);
    assert.deepEqual(
      (await (await fetch(`${baseUrl}/api/halls`)).json()).halls,
      [],
    );

    const pausedHallBooking = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hallId,
        meetingTitle: "Meeting during maintenance",
        bookingDate: "2026-12-01",
        startTime: "09:00",
        endTime: "10:00",
        participantCount: 12,
        contactName: "Example Contact",
        contactEmail: "contact@example.test",
        contactPhone: "+94112223344",
      }),
    });
    assert.equal(pausedHallBooking.status, 400);
    assert.deepEqual(await pausedHallBooking.json(), {
      error: { code: "HALL_UNAVAILABLE" },
    });

    const resumed = await fetch(`${baseUrl}/api/admin/halls/${hallId}/maintenance`, {
      method: "PATCH",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ bookingsPaused: false }),
    });
    assert.equal(resumed.status, 200);
    assert.equal((await resumed.json()).hall.bookingsPaused, false);
    assert.deepEqual(hallAuditActions.slice(-2), [
      "hall.maintenance_paused",
      "hall.maintenance_resumed",
    ]);

    const maintenancePath = `${baseUrl}/api/admin/halls/${hallId}/maintenance-windows`;
    const maintenanceBody = {
      startsAt: "2099-12-01T10:00",
      endsAt: "2099-12-01T11:00",
    };
    const invalidWindow = await fetch(maintenancePath, {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...maintenanceBody, endsAt: maintenanceBody.startsAt }),
    });
    assert.equal(invalidWindow.status, 400);
    assert.deepEqual(await invalidWindow.json(), {
      error: { code: "INVALID_MAINTENANCE_WINDOW" },
    });

    maintenanceBookingConflict = true;
    const overlapWarning = await fetch(maintenancePath, {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify(maintenanceBody),
    });
    assert.equal(overlapWarning.status, 409);
    assert.deepEqual((await overlapWarning.json()).error, {
      code: "MAINTENANCE_BOOKING_CONFLICT",
      details: {
        bookings: [{
          date: "2099-12-01",
          startTime: "10:00",
          endTime: "10:30",
          meetingTitle: "Existing meeting",
          contactName: "Example Contact",
        }],
      },
    });

    const createdWindow = await fetch(maintenancePath, {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...maintenanceBody, allowBookingConflicts: true }),
    });
    assert.equal(createdWindow.status, 201);
    assert.equal((await createdWindow.json()).conflicts.length, 1);
    const publicHallList = await fetch(`${baseUrl}/api/halls`);
    assert.equal(publicHallList.status, 200);
    assert.equal((await publicHallList.json()).halls[0].maintenanceWindows.length, 1);
    assert.match(
      queries.find(({ sql }) => sql.includes("FROM conference_halls h") && sql.includes("is_active = TRUE")).sql,
      /hall_maintenance_windows/,
    );

    maintenanceWindowConflict = true;
    const blockedBooking = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hallId,
        meetingTitle: "During scheduled maintenance",
        bookingDate: "2099-12-01",
        startTime: "10:00",
        endTime: "10:30",
        participantCount: 12,
        contactName: "Example Contact",
        contactEmail: "contact@example.test",
        contactPhone: "+94112223344",
      }),
    });
    maintenanceWindowConflict = false;
    assert.equal(blockedBooking.status, 409);
    assert.deepEqual(await blockedBooking.json(), {
      error: { code: "MAINTENANCE_TIME_UNAVAILABLE" },
    });

    const deletedWindow = await fetch(
      `${maintenancePath}/872a8e17-7fd4-4d3e-a363-c5b5e5eeae50`,
      {
        method: "DELETE",
        headers: {
          cookie,
          origin: "http://127.0.0.1:5173",
        },
      },
    );
    assert.equal(deletedWindow.status, 200);
  });

  it("changes the admin password and invalidates the previous session", async () => {
    const login = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:5173",
      },
      body: JSON.stringify({ username: admin.username, password: adminPassword }),
    });
    const oldCookie = login.headers.get("set-cookie").split(";")[0];
    const changed = await fetch(`${baseUrl}/api/admin/auth/password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:5173",
        cookie: oldCookie,
      },
      body: JSON.stringify({
        currentPassword: adminPassword,
        newPassword: "a different secure password",
      }),
    });

    assert.equal(changed.status, 200);
    const newCookie = changed.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (
        await fetch(`${baseUrl}/api/admin/auth/me`, {
          headers: { cookie: oldCookie },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/admin/auth/me`, {
          headers: { cookie: newCookie },
        })
      ).status,
      200,
    );
  });

  it("returns reserved times and hall names without exposing meeting or contact details", async () => {
    const response = await fetch(
      `${baseUrl}/api/availability?hallId=${hall.id}&month=2026-12`,
    );

    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result, {
      hallId: hall.id,
      month: "2026-12",
      slots: [{
        date: "2026-12-01",
        startTime: "09:00",
        endTime: "10:00",
        hallName: "Main Hall",
        status: "reserved",
      }],
    });
    assert.equal(JSON.stringify(result).includes("contactEmail"), false);
    assert.equal(JSON.stringify(result).includes("contactName"), false);
    assert.equal(JSON.stringify(result).includes("meetingTitle"), false);
    const query = [...queries].reverse().find(({ sql }) =>
      sql.includes("status IN ('pending', 'approved')"),
    );
    assert.deepEqual(query.params, [hall.id, "2026-12"]);
    assert.match(query.sql, /THEN 'completed'/);
    assert.match(query.sql, /ELSE 'reserved'/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  it("returns public reservations across all halls when hallId is omitted", async () => {
    const response = await fetch(`${baseUrl}/api/availability?month=2026-12`);

    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.hallId, null);
    assert.deepEqual(result.slots, [{
      date: "2026-12-01",
      startTime: "09:00",
      endTime: "10:00",
      hallName: "Main Hall",
      status: "reserved",
    }]);
    const query = [...queries].reverse().find(({ sql }) =>
      sql.includes("status IN ('pending', 'approved')"),
    );
    assert.deepEqual(query.params, [null, "2026-12"]);
    assert.match(query.sql, /THEN 'completed'/);
  });

  it("rejects times that do not use 15-minute increments", async () => {
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hallId: hall.id,
        meetingTitle: "Planning meeting",
        purpose: "This field is no longer collected",
        bookingDate: "2026-12-01",
        startTime: "09:07",
        endTime: "10:00",
        participantCount: 12,
        contactName: "Example Contact",
        contactDesignation: "Senior Officer",
        contactEmail: "contact@example.test",
        contactPhone: "+94112223344",
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: { code: "INVALID_BOOKING" },
    });
  });

  it("rejects booking dates in the past and start times that have already passed today", async () => {
    const booking = {
      hallId: hall.id,
      meetingTitle: "Planning meeting",
      bookingDate: "2000-01-01",
      startTime: "09:00",
      endTime: "10:00",
      participantCount: 12,
      contactName: "Example Contact",
      contactEmail: "contact@example.test",
      contactPhone: "+94112223344",
    };
    const pastDate = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(booking),
    });
    assert.equal(pastDate.status, 400);
    assert.deepEqual(await pastDate.json(), {
      error: { code: "BOOKING_DATE_PASSED" },
    });

    const todayParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Colombo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date()).filter((part) => part.type !== "literal").map(
      ({ type, value }) => [type, value],
    ));
    const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
    const pastTimeToday = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...booking,
        bookingDate: today,
        startTime: "00:00",
        endTime: "00:15",
      }),
    });
    assert.equal(pastTimeToday.status, 400);
    assert.deepEqual(await pastTimeToday.json(), {
      error: { code: "BOOKING_START_TIME_PASSED" },
    });
  });

  it("prevents overlapping pending or approved bookings", async () => {
    bookingConflict = true;
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hallId: hall.id,
        meetingTitle: "Conflicting meeting",
        purpose: "Project planning",
        bookingDate: "2026-12-01",
        startTime: "09:15",
        endTime: "10:15",
        participantCount: 12,
        contactName: "Example Contact",
        contactDesignation: "Senior Officer",
        contactEmail: "contact@example.test",
        contactPhone: "+94112223344",
      }),
    });
    bookingConflict = false;

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: { code: "BOOKING_TIME_UNAVAILABLE" },
    });
    assert.match(bookingConflictQuery, /booking_date \+ end_time/);
    assert.match(bookingConflictQuery, /Asia\/Colombo/);
  });

  it("rejects malformed public calendar query parameters", async () => {
    const response = await fetch(
      `${baseUrl}/api/availability?hallId=not-a-uuid&month=2026-13`,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: { code: "INVALID_AVAILABILITY_QUERY" },
    });
  });

  it("confirms a public booking immediately and queues requester and admin emails", async () => {
    const submission = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hallId: hall.id,
        meetingTitle: "Planning meeting",
        bookingDate: "2026-12-01",
        startTime: "09:00",
        endTime: "10:00",
        participantCount: 12,
        contactName: "Example Contact",
        contactDesignation: "Senior Officer",
        contactEmail: "contact@example.test",
        contactPhone: "+94112223344",
      }),
    });

    assert.equal(submission.status, 201);
    const receipt = await submission.json();
    assert.equal(receipt.emailStatus, "configuration_required");
    assert.match(receipt.reference, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(receipt.status, "approved");
    assert.match(bookingInsertSql, /'approved'/);
    assert.equal(bookingPurpose, "");
    assert.notEqual(bookingReferenceHash, receipt.reference);
    assert.equal(notificationsQueued.length, 3, JSON.stringify(notificationsQueued));
    bookingManageToken = decryptManageToken(
      notificationsQueued[0].params[2],
      authTokenSecret,
    );
    assert.match(bookingManageToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(receipt.manageToken, undefined);

    const status = await fetch(`${baseUrl}/api/bookings/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reference: receipt.reference }),
    });

    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.deepEqual(statusBody, {
      status: "approved",
      submittedAt: "2026-11-17T00:00:00.000Z",
    });
    assert.equal(JSON.stringify(statusBody).includes("contactEmail"), false);
    assert.deepEqual(notificationsQueued.slice(0, 2).map(({ params }) => params[1]), [
      "contact@example.test",
      "office@example.test",
    ]);
    assert.match(notificationsQueued[0].sql, /'booking_approved'/);
    assert.match(notificationsQueued[1].sql, /'new_booking_confirmed'/);
    assert.match(notificationsQueued[2].sql, /'booking_reminder'/);
  });

  it("allows requesters to securely inspect, edit, and cancel their booking", async () => {
    const lookup = await fetch(`${baseUrl}/api/bookings/manage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manageToken: bookingManageToken }),
    });
    assert.equal(lookup.status, 200);
    assert.equal(lookup.headers.get("cache-control"), "no-store");
    const managed = await lookup.json();
    assert.equal(managed.booking.contactEmail, "contact@example.test");
    assert.equal(managed.booking.contactDesignation, "Senior Officer");
    assert.equal(managed.canEdit, true);
    assert.equal(managed.canCancel, true);
    assert.equal(bookingManageTokenHash, queries.at(-1).params[0]);

    const invalidLink = await fetch(`${baseUrl}/api/bookings/manage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manageToken: "B".repeat(43) }),
    });
    assert.equal(invalidLink.status, 404);

    notificationsQueued = [];
    const changeBody = {
      manageToken: bookingManageToken,
      hallId: hall.id,
      meetingTitle: "Updated planning meeting",
      bookingDate: "2026-12-01",
      startTime: "09:00",
      endTime: "10:00",
      participantCount: 12,
      additionalRequirements: "",
      contactDesignation: "Attempted designation change",
    };
    const edited = await fetch(`${baseUrl}/api/bookings/manage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(changeBody),
    });
    assert.equal(edited.status, 200);
    assert.deepEqual(await edited.json(), { status: "approved", changed: true });
    assert.equal(bookingStatus, "approved");
    assert.equal(bookingUpdateParams[3], "Project planning");
    assert.equal(notificationsQueued.length, 4);
    assert.match(notificationsQueued[0].sql, /UPDATE notifications/);
    assert.equal(notificationsQueued[1].params[1], "booking_updated");
    assert.match(notificationsQueued[2].sql, /booking_changed/);
    assert.match(notificationsQueued[3].sql, /booking_reminder/);

    bookingStatus = "approved";
    const approvedEdit = await fetch(`${baseUrl}/api/bookings/manage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...changeBody, meetingTitle: "Another planning meeting" }),
    });
    assert.equal(approvedEdit.status, 200);
    assert.deepEqual(await approvedEdit.json(), { status: "approved", changed: true });

    bookingStatus = "approved";
    bookingMoreThanHourRemaining = false;
    const tooLateEdit = await fetch(`${baseUrl}/api/bookings/manage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...changeBody, meetingTitle: "Too late to edit" }),
    });
    assert.equal(tooLateEdit.status, 409);
    assert.deepEqual(await tooLateEdit.json(), {
      error: { code: "BOOKING_CANCELLATION_TOO_LATE" },
    });
    const tooLateCancel = await fetch(`${baseUrl}/api/bookings/manage/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manageToken: bookingManageToken }),
    });
    assert.equal(tooLateCancel.status, 409);

    bookingStatus = "approved";
    bookingMoreThanHourRemaining = false;
    const pendingTooLateCancel = await fetch(`${baseUrl}/api/bookings/manage/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manageToken: bookingManageToken }),
    });
    assert.equal(pendingTooLateCancel.status, 409);

    bookingMoreThanHourRemaining = true;
    notificationsQueued = [];
    const cancelled = await fetch(`${baseUrl}/api/bookings/manage/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manageToken: bookingManageToken }),
    });
    assert.equal(cancelled.status, 200);
    assert.deepEqual(await cancelled.json(), { status: "cancelled" });
    assert.equal(bookingStatus, "cancelled");
    assert.equal(notificationsQueued.length, 4);
    assert.match(notificationsQueued[3].sql, /requester_booking_cancelled/);
    const revokedLink = await fetch(`${baseUrl}/api/bookings/manage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manageToken: bookingManageToken }),
    });
    assert.equal(revokedLink.status, 404);
    bookingStatus = "approved";
    notificationsQueued = [];
  });

  it("does not allow admin approval and allows cancelling or reopening confirmed bookings", async () => {
    const login = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:5173",
      },
      body: JSON.stringify({
        username: admin.username,
        password: "a different secure password",
      }),
    });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    notificationsQueued = [];

    bookingStatus = "pending";
    const approvalAttempt = await fetch(
      `${baseUrl}/api/admin/calendar/bookings/${bookingId}/status`,
      {
        method: "PATCH",
        headers: {
          cookie,
          origin: "http://127.0.0.1:5173",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "approved" }),
      },
    );
    assert.equal(approvalAttempt.status, 409);
    assert.deepEqual(await approvalAttempt.json(), {
      error: { code: "BOOKING_STATUS_CONFLICT" },
    });

    notificationsQueued = [];
    const rejected = await fetch(
      `${baseUrl}/api/admin/calendar/bookings/${bookingId}/status`,
      {
        method: "PATCH",
        headers: {
          cookie,
          origin: "http://127.0.0.1:5173",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "rejected" }),
      },
    );
    assert.equal(rejected.status, 200);
    assert.deepEqual(await rejected.json(), { bookingId, status: "rejected" });
    const rejectionNotification = notificationsQueued.find(({ params }) =>
      params[1] === "booking_rejected",
    );
    assert.ok(rejectionNotification);

    notificationsQueued = [];
    bookingStatus = "approved";
    const cancelled = await fetch(
      `${baseUrl}/api/admin/calendar/bookings/${bookingId}/status`,
      {
        method: "PATCH",
        headers: {
          cookie,
          origin: "http://127.0.0.1:5173",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "cancelled" }),
      },
    );
    assert.equal(cancelled.status, 200);
    assert.deepEqual(await cancelled.json(), {
      bookingId,
      status: "cancelled",
    });
    assert.ok(
      notificationsQueued.some(({ params }) => params[1] === "booking_cancelled"),
    );
    assert.match(notificationsQueued.at(-1).sql, /UPDATE notifications/);

    bookingStatus = "cancelled";
    notificationsQueued = [];
    bookingConflict = true;
    const conflictingReopen = await fetch(
      `${baseUrl}/api/admin/calendar/bookings/${bookingId}/status`,
      {
        method: "PATCH",
        headers: {
          cookie,
          origin: "http://127.0.0.1:5173",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "approved" }),
      },
    );
    assert.equal(conflictingReopen.status, 409);
    assert.deepEqual(await conflictingReopen.json(), {
      error: { code: "BOOKING_TIME_UNAVAILABLE" },
    });
    bookingConflict = false;

    bookingUpcoming = false;
    const pastReopen = await fetch(
      `${baseUrl}/api/admin/calendar/bookings/${bookingId}/status`,
      {
        method: "PATCH",
        headers: {
          cookie,
          origin: "http://127.0.0.1:5173",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "approved" }),
      },
    );
    assert.equal(pastReopen.status, 409);
    assert.deepEqual(await pastReopen.json(), {
      error: { code: "BOOKING_DATE_PASSED" },
    });
    bookingUpcoming = true;

    const reopened = await fetch(
      `${baseUrl}/api/admin/calendar/bookings/${bookingId}/status`,
      {
        method: "PATCH",
        headers: {
          cookie,
          origin: "http://127.0.0.1:5173",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "approved" }),
      },
    );
    assert.equal(reopened.status, 200);
    assert.deepEqual(await reopened.json(), {
      bookingId,
      status: "approved",
    });
    assert.equal(bookingStatus, "approved");
    assert.equal(bookingManageTokenActive, true);
    assert.equal(notificationsQueued[0].params[1], "booking_reopened");
    assert.ok(notificationsQueued[0].params[3]);
    assert.match(notificationsQueued[1].sql, /booking_reopened_admin/);
    const restoredManageToken = decryptManageToken(
      notificationsQueued[0].params[3],
      authTokenSecret,
    );
    const restoredManagePage = await fetch(`${baseUrl}/api/bookings/manage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manageToken: restoredManageToken }),
    });
    assert.equal(restoredManagePage.status, 200);
  });

  it("rejects public booking submissions with a honeypot value", async () => {
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ website: "spam" }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: { code: "INVALID_BOOKING" },
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

  it("does not rate-limit failed booking submissions and allows 30 successful bookings per 15 minutes", async () => {
    const url = `${baseUrl}/api/bookings`;
    const options = {
      method: "POST",
      headers: { "content-type": "application/json" },
    };

    for (let attempt = 0; attempt < 31; attempt += 1) {
      const response = await fetch(url, { ...options, body: JSON.stringify({}) });
      assert.equal(response.status, 400);
    }

    const booking = {
      hallId: hall.id,
      meetingTitle: "Rate limit test",
      purpose: "Project planning",
      bookingDate: "2026-12-01",
      startTime: "09:00",
      endTime: "10:00",
      participantCount: 12,
      contactName: "Example Contact",
      contactDesignation: "Senior Officer",
      contactEmail: "contact@example.test",
      contactPhone: "+94112223344",
    };

    for (let attempt = 0; attempt < 29; attempt += 1) {
      const response = await fetch(url, {
        ...options,
        body: JSON.stringify(booking),
      });
      assert.equal(response.status, 201);
    }

    const limited = await fetch(url, {
      ...options,
      body: JSON.stringify(booking),
    });
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), {
      error: { code: "BOOKING_RATE_LIMIT_EXCEEDED" },
    });
  });
});
