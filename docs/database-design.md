# Database design

## Status

The PostgreSQL migrations are under `database/migrations/`. Apply pending migrations with `npm run db:migrate --workspace backend`. Do not edit an applied migration; add a new ordered migration for later changes.

## Tables

- **`admins`** — unique username, bcrypt password hash, active flag, and token version used to revoke sessions. Accounts are provisioned by a local CLI command; there is no public registration or `users` table. Migration `002_admin_usernames.sql` backfills usernames for existing admin accounts from their email local part; email is no longer required for new accounts.
- **`conference_halls`** — public display fields, positive capacity, facilities, and active state.
- **`bookings`** — hall reference, meeting details, booking date/time, participant count, requester contact details, pending/approval status, and a unique SHA-256 hash of the public status reference. Constraints enforce positive participants and end time after start time.
- **`notifications`** — email event, recipient, scheduled delivery time, retry state, and delivery/error timestamps. SMTP credentials and the office recipient are configured separately in environment variables.
- **`audit_logs`** — admin actions, optional admin reference, event details, and timestamp. Login and password change are currently recorded.
- **`schema_migrations`** — migration runner bookkeeping.

## Privacy and security

The public booking flow necessarily receives contact information. The status reference is generated from 32 random bytes; only its hash is stored. Status lookups return no personal or meeting details. Treat the raw reference like a credential and do not place it in URLs or logs.

Development must use synthetic data. Retention period, deletion process, data residency, encryption-at-rest requirements, and approved access to contact information require Ministry confirmation before production use.

## Not yet implemented

SMS delivery, admin inbox configuration, backups, and retention enforcement remain future work. SMTP email jobs are processed by a single-process worker; multi-instance deployments need worker coordination and monitoring.
