ALTER TABLE bookings
  ADD COLUMN manage_token_hash CHAR(64) UNIQUE;

ALTER TABLE notifications
  ADD COLUMN manage_token_encrypted TEXT;
