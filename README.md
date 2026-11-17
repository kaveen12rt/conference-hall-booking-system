# Conference Hall Booking System

A planned web-based conference hall reservation and management system for the Ministry of Digital Economy, Sri Lanka.

> **Project status:** Early implementation. The public booking form and schedule, `/admin` sign-in and booking calendar, booking review actions, and queued email notifications are wired to the API. SMTP delivery remains disabled until configured, and production hardening is not complete. This is not a production system.

## Project goals

The proposed system will support conference hall discovery, booking requests, authorized review, availability management, and operational reporting. Requirements and workflows that depend on Ministry policy remain subject to confirmation.

## Proposed technology

- **Frontend:** React, Vite, JavaScript, HTML, and CSS
- **Backend:** Node.js, Express, and REST APIs
- **Data store:** PostgreSQL, accessed through the `pg` connection pool
- **Development and delivery:** GitHub Actions, Docker Compose, ESLint, and automated tests

Versions and dependency choices will be recorded and checked for compatibility when the implementation foundation is created.

## Repository layout

```text
.github/       Collaboration templates and CI workflows
backend/       Express API and backend tests
database/      Database schema, migrations, and seed tooling
docs/          Requirements, architecture, and operational guides
frontend/      React application and frontend tests
scripts/       Development and maintenance utilities
```

See [Project overview](docs/project-overview.md) and [System architecture](docs/system-architecture.md) for the architecture baseline and unresolved decisions.

## Development status

1. Requirements analysis and system architecture — baseline documented; Ministry decisions pending
2. Repository and project configuration — **foundation in progress**
3. Database design and backend foundation
4. Admin authentication and public booking API — **initial implementation**
5. Frontend design system and account/booking screens — **initial implementation**
6. Hall management
7. Booking and availability management
8. Approval workflow and notifications — initial email queue and review actions
9. Reports and audit logs
10. Testing, security review, and optimization
11. Deployment preparation and documentation

Phases will be implemented and verified incrementally. A listed capability is a goal, not a claim that it is already available.

## Local development

Requirements: Node.js 22, npm, and Docker Desktop (for the local PostgreSQL service).

```powershell
Copy-Item .env.example .env
npm ci
# Generate a secret and place it in .env as AUTH_TOKEN_SECRET
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
docker compose up -d postgres
npm run db:migrate --workspace backend
npm run admin:create
```

The admin setup command prompts for a username and a password without echoing the password. Use 3-32 letters, numbers, dots, underscores, or hyphens for the username and a password with at least 12 characters. Admin accounts are created through this local command; there is no public registration endpoint. Do not use the example local database password outside development.

Start the API and frontend together from the repository root:

```powershell
npm run dev
```

Keep this terminal open while using the application. Press `Ctrl+C` to stop both services. If either service exits, the combined command stops the other service too, making startup failures visible instead of leaving a half-working site.

The frontend is available at `http://127.0.0.1:5173`. The API listens at `http://127.0.0.1:3000`.

Email notifications are queued in PostgreSQL. Configure all `NOTIFICATION_SMTP_*` settings and `NOTIFICATION_FROM_EMAIL` in `.env` to enable delivery. Set `ADMIN_NOTIFICATION_EMAIL` to the authorized office inbox for new-booking alerts; requester confirmations, decisions, and one-hour reminders use the contact email on each booking. Without SMTP configuration, emails remain queued and the public form says delivery is not configured. Do not commit SMTP credentials.

Implemented API routes:

- `GET /api/halls` — list active halls for the public form.
- `GET /api/availability?month=YYYY-MM[&hallId=<uuid>]` — return reserved dates, times, and hall names for pending/approved requests; no meeting or contact details. Omitting `hallId` returns reservations across all halls.
- Public booking times use 15-minute increments; overlapping requests return `409 BOOKING_TIME_UNAVAILABLE`.
- `POST /api/bookings` — submit a validated public booking request; queues requester confirmation and, when configured, office alert emails.
- `POST /api/bookings/status` — exchange that reference for status only; no personal booking details are returned.
- `POST /api/admin/auth/login`, `POST /api/admin/auth/logout`, `GET /api/admin/auth/me`, `POST /api/admin/auth/password` — admin-only account lifecycle.
- `GET /api/admin/calendar/bookings?month=YYYY-MM[&hallId=<uuid>]` — admin-only booking calendar including status and contact details.
- `PATCH /api/admin/calendar/bookings/:bookingId/status` — approve/reject pending bookings or cancel a pending/approved booking; queues an email to the requester and a one-hour reminder on approval.
- `POST /api/admin/halls` — admin-only creation of a conference hall; new active halls are available on the public booking form.
- `GET /api/health` — database readiness check.

The public and admin calendars show Sri Lanka time and refresh their booking data every 30 seconds; the on-screen clock updates every second. Public calendar slots include pending and approved requests only and show dates, times, and hall names without meeting or contact details. Admin calendar details and review actions require an authenticated admin session. Admin sessions use a short-lived HttpOnly, SameSite=Strict cookie. Admin route fallback is protected. The API has a per-IP general limit of 300 requests per 15 minutes, plus tighter in-memory limits on login, public booking, and status lookups; the form accepts a honeypot field. These are baseline anti-abuse protections, not a substitute for an approved CAPTCHA or a shared rate-limit store in multi-instance deployment. Email delivery requires the optional SMTP configuration above; no SMS notifications are configured. See [API documentation](docs/api-documentation.md) and [database design](docs/database-design.md).

Stop the local database with `docker compose down`.

Run the checks before opening a pull request:

```powershell
npm run lint
npm test
npm run build
```

## Security and handling

- Do not commit credentials, private keys, personal information, or production data.
- Use synthetic data for development and tests.
- Do not publish or deploy the system without the Ministry's authorization and approved infrastructure.
- Do not disclose suspected vulnerabilities publicly; an approved private reporting channel must be established before production use.

## Collaboration

The intended workflow uses `main` for production-ready changes, `develop` for integration, and short-lived `feature/*`, `fix/*`, and `hotfix/*` branches. Changes should be proposed through reviewed pull requests. Branch protections and team permissions must be configured in GitHub and are not established by this source tree.

## License and distribution

The intended project is proprietary and for authorized internal use. The applicable owner, license, and distribution terms must be confirmed before external distribution.
