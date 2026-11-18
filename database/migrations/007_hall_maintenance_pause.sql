ALTER TABLE conference_halls
  ADD COLUMN bookings_paused BOOLEAN NOT NULL DEFAULT FALSE;
