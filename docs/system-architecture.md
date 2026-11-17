# System architecture

## Status and principles

This is the proposed architecture and current early implementation baseline. Existing endpoints are not evidence of production readiness.

Design principles:

- Separate browser UI, API, domain/business logic, and persistence concerns.
- Validate and authorize every sensitive operation on the server.
- Keep policy-dependent rules configurable only after the Ministry approves their meaning.
- Prefer portable deployment artifacts and environment-based configuration.
- Record security-relevant actions without logging secrets or unnecessary personal data.
- Verify features with automated tests at appropriate boundaries.

## Proposed repository structure

```text
.github/
  workflows/             CI checks; deployment workflow only after approval
  ISSUE_TEMPLATE/
  CODEOWNERS
docs/                     Requirements, architecture, API, operations, and user guides
frontend/
  public/
  src/
    assets/ components/ layouts/ pages/
    hooks/ services/ utils/ types/ styles/
  tests/
backend/
  src/
    config/ controllers/ middleware/ models/ routes/
    services/ validators/ utils/ app/
  tests/
database/
  migrations/ seeds/ schema/
scripts/
```

Root configuration is expected to include `.editorconfig`, `.gitattributes`, `.gitignore`, a safe `.env.example`, contribution and security policies, and Docker Compose configuration. Add files as their purpose is implemented; do not add empty or misleading workflows that suggest unimplemented checks or deployment.

## Runtime boundaries

```text
Browser
  -> React/Vite frontend
  -> HTTPS REST API (Express)
       -> middleware: request parsing, validation, authentication, authorization, error handling
       -> controllers: HTTP translation only
       -> services: booking, hall, identity, reporting, and audit use cases
       -> routes/services: parameterized SQL through a PostgreSQL connection pool
       -> PostgreSQL
```

- The frontend owns presentation, accessible interaction, client-side input feedback, and API calls. Client checks do not replace server validation.
- The API owns request validation, authorization, consistent response/error formats, and the public API contract.
- Services own domain operations and policy enforcement; controllers should not contain core business rules.
- PostgreSQL stores relational domain records. Schema migrations, constraints, indexes, and database-level concurrency protections for booking conflicts must be designed and tested before approval workflows are implemented. API queries must use parameterized SQL.
- Notifications and file storage should be behind replaceable service interfaces if those capabilities are approved. No provider is selected in Phase 1.

## Proposed domain boundaries

- **Identity and access:** admins only; public visitors have no accounts or authentication.
- **Halls:** hall descriptions, capacity, facilities, and operational availability.
- **Bookings:** booking requests, lifecycle transitions, conflict checks, and booking history.
- **Notifications:** queued email receipts, booking decisions, and one-hour reminders; SMTP and the office recipient are operational configuration.
- **Reporting and audit:** authorized aggregate reports and traceable administrative actions.
- **System configuration:** explicitly approved operational settings, not secrets.

The initial migration creates `admins`, `conference_halls`, `bookings`, `notifications`, and `audit_logs`; no `users` table or public account flow is present. Admin session cookies contain short-lived signed tokens; a version counter in `admins` invalidates sessions on password change. Public booking status is retrieved with a random one-time reference whose SHA-256 hash alone is stored; the status endpoint returns no contact or meeting information.

The public availability API returns only occupied time ranges for pending and approved bookings for the selected hall and month. The admin calendar is protected by the admin-session middleware and returns full booking details. Both calendars poll every 30 seconds; the UI clock updates every second using `Asia/Colombo`.

## Security and operational baseline

The implementation uses bcrypt password hashes, signed short-lived admin tokens in HttpOnly/SameSite cookies, server-side admin checks, request validation, rate limits, Helmet, restrictive credentialed CORS, same-origin checks for admin mutations, and environment-managed signing secrets. Public booking uses server validation, an opaque reference, and a honeypot; CAPTCHA and distributed rate limiting remain production decisions. File uploads, if required, need explicit content, size, storage, and access rules before implementation.

Production deployment must wait for approved hosting and Ministry security requirements. Before that decision, document container builds, health checks, structured logging, monitoring, backup/recovery, and rollback in a provider-neutral way. Do not create an enabled deployment pipeline that can publish to an unapproved environment.

## Decisions required

Confirm these before implementing the affected behavior:

1. **Identity:** whether locally managed admin accounts are acceptable or Ministry SSO is required; admin account provisioning, MFA, password policy, and session duration requirements.
2. **Authorization:** exact admin responsibilities, separation of duties, and who may create or disable admin accounts.
3. **Booking policy:** operating hours, time zone, minimum/maximum duration, lead time, recurring requests, buffers, and how simultaneous requests are resolved.
4. **Approval and cancellation:** approval path, delegation, rejection reasons, cancellation rights and deadlines, and transitions to completed status.
5. **Halls and availability:** who can create or deactivate halls, maintenance blocks, and whether availability can be overridden.
6. **Notifications:** email was selected for requester receipts/decisions and the office's new-request alerts; reminders are scheduled one hour before an approved meeting. SMTP provider, official inbox, and message policy still require Ministry configuration/approval.
7. **Data governance:** personal data fields, retention/deletion periods, audit retention, data residency, backup policy, and access to exported reports.
8. **Uploads and integrations:** whether photographs or attachments are needed, approved storage, file constraints, and any external calendar or system integrations.
9. **User experience:** required languages (Sinhala, Tamil, English), accessibility conformance target, and supported browsers/devices.
10. **Operations and governance:** approved hosting environment, CI/CD permissions, production approvers, incident contact, ownership, and applicable license/distribution terms.

Do not use real government or personal data in development or tests. Record confirmed answers and their approving authority before translating them into system policy.
