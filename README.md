# Conference Hall Booking System

A planned web-based conference hall reservation and management system for the Ministry of Digital Economy, Sri Lanka.

> **Project status:** Phase 2 — repository foundation. The frontend is a placeholder and the backend currently provides only a database readiness endpoint. This is not a production system; production use, hosting, and Ministry approval are not implied.

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
4. Authentication and authorization
5. Frontend design system and dashboard
6. Hall management
7. Booking and availability management
8. Approval workflow and notifications
9. Reports and audit logs
10. Testing, security review, and optimization
11. Deployment preparation and documentation

Phases will be implemented and verified incrementally. A listed capability is a goal, not a claim that it is already available.

## Local development

Requirements: Node.js 22, npm, and Docker Desktop (for the local PostgreSQL service).

```powershell
Copy-Item .env.example .env
npm ci
docker compose up -d postgres
```

In separate terminals, start the API and frontend:

```powershell
npm run dev:backend
npm run dev:frontend
```

The frontend is available at `http://127.0.0.1:5173`. The API listens at `http://127.0.0.1:3000`; `GET /api/health` runs a PostgreSQL query and reports ready only when the database is reachable. The API currently has no booking tables or data endpoints. Stop the local database with `docker compose down`.

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
