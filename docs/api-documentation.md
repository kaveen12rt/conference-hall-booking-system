# API documentation

## Status

This describes the initial backend endpoints. It is not a production API contract; notification delivery requires SMTP configuration and Ministry policy approval.

Base URL in local development: `http://127.0.0.1:3000`.

JSON request bodies are limited to 10 KB. Database queries use bound parameters. Error responses have the shape `{ "error": { "code": "..." } }`.

## Public endpoints

### `GET /api/halls`

Returns active hall summaries only:

```json
{
  "halls": [
    {
      "id": "uuid",
      "name": "Main Hall",
      "description": "",
      "capacity": 100,
      "facilities": ["projector"]
    }
  ]
}
```

### `POST /api/bookings`

Creates a booking without requiring a public account. Required fields: `hallId`, `meetingTitle`, `purpose`, `bookingDate` (`YYYY-MM-DD`), `startTime` and `endTime` (`HH:MM`), positive integer `participantCount`, `contactName`, `contactEmail`, and `contactPhone`. `contactDesignation` and `additionalRequirements` are optional. The hidden `website` honeypot must remain empty. A valid booking is confirmed immediately; administrators can cancel it later.

The server validates field types and bounds, date/time format and ordering, active hall and capacity. Start and end times must be on 15-minute boundaries (for example, `09:00`, `09:15`, or `09:30`), and a booking must end later on the same day. The form advances the end time if a changed start time would otherwise make the interval invalid; its latest same-day start is `23:30`. The server prevents overlapping pending/approved bookings for the same hall and date; adjacent bookings are allowed. A conflict returns `409 BOOKING_TIME_UNAVAILABLE`. Booking policy (timezone, operating hours, past dates, and lead times) remains unconfirmed and is not inferred here.

Success (`201`) returns a 256-bit random reference once:

```json
{
  "reference": "opaque-secret-reference",
  "status": "approved",
  "statusEndpoint": "/api/bookings/status"
}
```

Store this reference privately. Only its SHA-256 hash is stored in PostgreSQL. The reference is a bearer secret; anyone possessing it can retrieve that request's status.

The confirmation email also contains a separate secure management link. Its 256-bit token is stored as a SHA-256 hash in the booking row; while its confirmation is queued, an encrypted copy is held in the email queue and cleared after delivery. The token is not returned in the API response and is revoked when a booking is cancelled or rejected. A reminder is queued for upcoming meetings.

### Requester booking management

These endpoints require the secure management token emailed to the requester. The token is a bearer credential: do not share it. The email link carries it in the URL fragment (not sent to the web server in the page request), and the web page removes it from the address bar after loading.

- `POST /api/bookings/manage` — body `{ "manageToken": "..." }`; returns the booking details, including the saved requester designation, and `canEdit`/`canCancel` flags with `Cache-Control: no-store`.
- `PATCH /api/bookings/manage` — body includes `manageToken` and the editable booking fields (`hallId`, `meetingTitle`, `purpose`, `bookingDate`, `startTime`, `endTime`, `participantCount`, and optional `additionalRequirements`). Contact identity details cannot be changed through this link. The server revalidates hall capacity and conflicts transactionally.
- `POST /api/bookings/manage/cancel` — body `{ "manageToken": "..." }`.

Requesters can edit or cancel confirmed bookings more than one hour before the meeting starts; the cancellation cutoff uses Asia/Colombo time. Contact identity details, including designation, cannot be changed through the management link. Editing a confirmed booking keeps it confirmed, notifies the requester and authorized office inbox when configured, and reschedules its reminder. Rejected, completed, or cancelled bookings cannot be edited or cancelled again. Migration `006_auto_confirm_bookings.sql` automatically confirms all bookings that were pending when this policy was introduced and queues confirmation emails/reminders.

### `POST /api/bookings/status`

Request:

```json
{ "reference": "opaque-secret-reference" }
```

Returns only status and submission time. It does not expose names, contact details, hall, meeting title, or purpose. Invalid and unknown references both return `404 BOOKING_NOT_FOUND`.

### `GET /api/availability?month=YYYY-MM[&hallId=<uuid>]`

Returns dates, start/end times, hall names, and a public-safe status for `pending` and `approved` bookings in the requested month. An approved booking is reported as `completed` once its scheduled end passes in Asia/Colombo time; other bookings are reported as `reserved` without revealing whether they are pending or approved. Completed bookings remain visible in the calendar but no longer block a new request for that time. `hallId` is optional; when omitted, reservations across all halls are returned:

```json
{
  "hallId": "uuid",
  "month": "2026-12",
  "slots": [
    {
      "date": "2026-12-01",
      "startTime": "09:00",
      "endTime": "10:00",
      "hallName": "Main Hall",
      "status": "reserved"
    }
  ]
}
```

No booking IDs, status, contact details, participant counts, or meeting information are returned. The public calendar refreshes every 30 seconds. A date with no returned reservations does not guarantee that the hall is operational or available outside its confirmed operating hours; operating hours have not yet been defined.

### `GET /api/health`

Runs `SELECT 1`; returns `200` when PostgreSQL is reachable and `503` otherwise.

## Admin endpoints

Admin routes require the signed `admin_session` HttpOnly cookie. Login is limited to five attempts per IP per 15 minutes. Mutating admin endpoints require the configured frontend `Origin`.

- `POST /api/admin/auth/login` — body `{ "username": "...", "password": "..." }`; returns the admin ID/username, whether SMTP email delivery is configured, and sets a 30-minute `SameSite=Strict` cookie. Usernames are 3-32 letters, numbers, dots, underscores, or hyphens and are case-insensitive.
- `POST /api/admin/auth/logout` — clears the cookie and revokes that admin's prior tokens.
- `GET /api/admin/auth/me` — returns the authenticated admin ID/username and whether SMTP email delivery is configured.
- `GET /api/admin/notifications` — returns the number and up to 10 most recent bookings created in the last 24 hours, including their current status, for the admin dashboard notification menu. Response is `Cache-Control: no-store`.
- `GET /api/admin/reports/monthly?month=YYYY-MM` — returns per-day counts for requests, approved/completed meetings, pending requests, and cancelled/rejected requests. Counts use each booking's current state; approved meetings are marked completed after their scheduled end in Asia/Colombo time. Response is `Cache-Control: no-store`.
- `POST /api/admin/auth/password` — body `{ "currentPassword": "...", "newPassword": "..." }`; new passwords must be 12-72 UTF-8 bytes. Existing sessions are invalidated by incrementing the admin token version; the current session is replaced.
- `GET /api/admin/calendar/bookings?month=YYYY-MM[&hallId=<uuid>]` — returns all booking states and booking/contact details for the selected month, optionally filtered by hall. Approved bookings whose scheduled end has passed in Asia/Colombo time are returned as `completed`. Admin-only and `Cache-Control: no-store`.
- `PATCH /api/admin/calendar/bookings/:bookingId/status` — body `{ "status": "rejected" | "cancelled" | "approved" }`. New bookings are automatically confirmed, so admin approval is not available. Legacy pending bookings can be rejected or cancelled; confirmed bookings can be cancelled; a cancelled booking can be reopened as confirmed. Reopening rejects past bookings and checks for time conflicts under the same booking lock. A successful reopen creates a fresh requester-management token, queues a requester email with the new link, notifies the authorized office inbox, schedules a reminder, and is recorded in the audit log. Cancellation prevents pending reminders from being sent.
- `POST /api/admin/halls` — creates an active hall from `{ "name": "...", "description": "...", "capacity": 100, "facilities": ["projector"] }`. Admin session and same-origin request are required; creation is recorded in `audit_logs`.

There is no public registration endpoint and no public `users` identity table. Create an admin through the interactive local command `npm run admin:create` from the repository root or backend directory. Unknown `/api/admin/*` routes are protected and return `401` without an admin session.

## Email notifications

All notification types use the same bilingual, responsive HTML email layout with a plain-text alternative, consistent subject prefix, inline State Emblem of Sri Lanka, booking summary, and Ministry of Digital Economy footer. The sender display name is “Conference Hall Booking Service | Ministry of Digital Economy”; the configured `NOTIFICATION_FROM_EMAIL` address still determines the actual sending domain and should be an authorized official address before government use.

The booking form queues a receipt email to the requester and a new-request alert to `ADMIN_NOTIFICATION_EMAIL` when that address is configured. Booking decisions are emailed to the requester; approvals also queue a one-hour reminder. Pending email jobs are stored in PostgreSQL and processed with retries. The API reports that email delivery is not configured until the complete SMTP settings are present. Configure `NOTIFICATION_SMTP_HOST`, `NOTIFICATION_SMTP_PORT`, `NOTIFICATION_SMTP_USER`, `NOTIFICATION_SMTP_PASSWORD`, `NOTIFICATION_FROM_EMAIL`, and optionally `NOTIFICATION_SMTP_SECURE` plus `ADMIN_NOTIFICATION_EMAIL` in the local `.env`. Never put credentials in source control. The admin inbox is not configured by default.

## Abuse limits

The API applies a general per-process limit of 300 requests per IP every 15 minutes (excluding the health endpoint), a per-IP booking submission limit (five per hour), status and booking-management limits (30 per 15 minutes each), and an admin login limit. The current express in-memory limiter is suitable only for a single local instance; production multi-instance deployment needs an approved shared store and proxy/IP configuration. The honeypot is supplemental spam mitigation, not CAPTCHA.
