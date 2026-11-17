# Project overview

## Purpose

Plan a secure, maintainable web system for managing conference hall availability and reservation workflows for the Ministry of Digital Economy, Sri Lanka.

This document records the initial project scope. It does not assert that the system has been implemented, approved for production, or authorized for deployment.

## Access model

- **Administrator:** the only account type that authenticates. Admin accounts are created locally by an operator; public registration is not available.
- **Public visitor:** does not log in or create an account. Visitors can view active hall summaries, submit a booking request, and retrieve status using a secret reference issued at submission.

The exact admin responsibilities and booking approval authority still require Ministry confirmation.

## Candidate capabilities

- Admin authentication, logout, and password change.
- Public booking without public user accounts or login.
- Public hall availability calendar and admin-only booking calendar.
- Hall information, facilities, and availability management.
- Booking requests with date, time, meeting details, participant count, and requirements.
- A review workflow with booking status history.
- Availability views and server-side conflict prevention.
- Notifications, reporting, and audit records.

Admin authentication, the public booking/status API, live public/admin calendars, booking review actions, and a configurable email notification queue are implemented as an early foundation. SMTP credentials and the official admin recipient must be configured before email delivery works. Reports are not implemented. Exact workflow behavior and policy constraints are open questions listed in [System architecture](system-architecture.md#decisions-required).

## Proposed technical baseline

- React and Vite browser application.
- Node.js and Express REST API.
- PostgreSQL accessed through a connection pool, with SQL migrations.
- Docker Compose for a local development database.
- GitHub Actions for linting, tests, and frontend build checks.

The deployment target has not been selected. The implementation must remain portable and follow approved Ministry infrastructure and security requirements.

## Delivery approach

Work in verifiable stages: requirements and architecture; repository foundation; data and API foundation; identity and access control; frontend; hall and booking workflows; operational features; then deployment preparation. Do not treat a running development server as evidence that the system is production-ready.

## Out of scope until confirmed

- Any real Ministry, staff, or booking data.
- Public user accounts or public authentication.
- A specific identity provider, hosting provider, or government infrastructure integration.
- Binding approval, cancellation, retention, or notification policies.
- Public release, production deployment, or a confirmed license.
