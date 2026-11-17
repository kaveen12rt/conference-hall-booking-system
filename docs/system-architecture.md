# System architecture

## Status and principles

This is the Phase 1 proposed architecture. It is a design baseline, not a claim that application components or security controls have been implemented.

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
       -> repositories/models: Mongoose persistence
       -> MongoDB
```

- The frontend owns presentation, accessible interaction, client-side input feedback, and API calls. Client checks do not replace server validation.
- The API owns request validation, authorization, consistent response/error formats, and the public API contract.
- Services own domain operations and policy enforcement; controllers should not contain core business rules.
- MongoDB stores domain records. Mongoose schemas define field validation and indexes; database-level concurrency protections for booking conflicts must be designed and tested before booking implementation.
- Notifications and file storage should be behind replaceable service interfaces if those capabilities are approved. No provider is selected in Phase 1.

## Proposed domain boundaries

- **Identity and access:** users, role assignments, authentication lifecycle, and authorization.
- **Halls:** hall descriptions, capacity, facilities, and operational availability.
- **Bookings:** booking requests, lifecycle transitions, conflict checks, and booking history.
- **Notifications:** delivery requests and delivery status, when channels and policy are confirmed.
- **Reporting and audit:** authorized aggregate reports and traceable administrative actions.
- **System configuration:** explicitly approved operational settings, not secrets.

Potential MongoDB collections include users, halls, bookings, notifications, audit logs, and system settings. A separate roles/permissions collection is not assumed; the authorization model depends on the confirmed role and permission requirements. Schema fields, retention, indexes, and relationships belong in the database design phase.

## Security and operational baseline

The implementation should use secure password hashing if local passwords are approved, least-privilege authorization, request validation, rate limiting, Helmet, restrictive CORS, safe error responses, and secret management outside version control. File uploads, if required, need explicit content, size, storage, and access rules before implementation.

Production deployment must wait for approved hosting and Ministry security requirements. Before that decision, document container builds, health checks, structured logging, monitoring, backup/recovery, and rollback in a provider-neutral way. Do not create an enabled deployment pipeline that can publish to an unapproved environment.

## Decisions required

Confirm these before implementing the affected behavior:

1. **Identity:** Ministry identity provider/SSO or locally managed accounts; account provisioning, MFA, password, and session/token requirements.
2. **Authorization:** approved role names, exact permissions, separation of duties, and who can manage users or audit records.
3. **Booking policy:** operating hours, time zone, minimum/maximum duration, lead time, recurring requests, buffers, and how simultaneous requests are resolved.
4. **Approval and cancellation:** approval path, delegation, rejection reasons, cancellation rights and deadlines, and transitions to completed status.
5. **Halls and availability:** who can create or deactivate halls, maintenance blocks, and whether availability can be overridden.
6. **Notifications:** approved channels (email/SMS/in-app), service provider, message language, and reminder schedule.
7. **Data governance:** personal data fields, retention/deletion periods, audit retention, data residency, backup policy, and access to exported reports.
8. **Uploads and integrations:** whether photographs or attachments are needed, approved storage, file constraints, and any external calendar or system integrations.
9. **User experience:** required languages (Sinhala, Tamil, English), accessibility conformance target, and supported browsers/devices.
10. **Operations and governance:** approved hosting environment, CI/CD permissions, production approvers, incident contact, ownership, and applicable license/distribution terms.

Do not use real government or personal data in development or tests. Record confirmed answers and their approving authority before translating them into system policy.
