# Project overview

## Purpose

Plan a secure, maintainable web system for managing conference hall availability and reservation workflows for the Ministry of Digital Economy, Sri Lanka.

This document records the initial project scope. It does not assert that the system has been implemented, approved for production, or authorized for deployment.

## Intended user groups

The initial proposal identifies three user groups:

- **System administrator:** administer users, halls, configuration, reports, and audit records.
- **Booking officer:** review requests and manage reservation records.
- **Staff member / registered user:** browse halls, request bookings, and manage their own reservations subject to policy.

The Ministry must confirm role names, responsibilities, separation of duties, and access rules before implementation.

## Candidate capabilities

- Authentication and role-based authorization.
- Hall information, facilities, and availability management.
- Booking requests with date, time, meeting details, participant count, and requirements.
- A review workflow with booking status history.
- Availability views and server-side conflict prevention.
- Notifications, reporting, and audit records.

These are proposed capabilities, not implemented features. Exact workflow behavior and policy constraints are open questions listed in [System architecture](system-architecture.md#decisions-required).

## Proposed technical baseline

- React and Vite browser application.
- Node.js and Express REST API.
- PostgreSQL accessed through a connection pool.
- Docker Compose for a local development database.
- GitHub Actions for linting, tests, and frontend build checks.

The deployment target has not been selected. The implementation must remain portable and follow approved Ministry infrastructure and security requirements.

## Delivery approach

Work in verifiable stages: requirements and architecture; repository foundation; data and API foundation; identity and access control; frontend; hall and booking workflows; operational features; then deployment preparation. Do not treat a running development server as evidence that the system is production-ready.

## Out of scope until confirmed

- Any real Ministry, staff, or booking data.
- A specific identity provider, hosting provider, or government infrastructure integration.
- Binding approval, cancellation, retention, or notification policies.
- Public release, production deployment, or a confirmed license.
