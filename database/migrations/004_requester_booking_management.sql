ALTER TABLE bookings
  ADD COLUMN manage_token_hash CHAR(64) NULL UNIQUE;

ALTER TABLE notifications
  ADD COLUMN manage_token_encrypted TEXT NULL;
