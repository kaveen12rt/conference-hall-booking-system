ALTER TABLE notifications
  ADD COLUMN recipient_email TEXT,
  ADD COLUMN scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN claimed_at TIMESTAMPTZ,
  ADD COLUMN delivered_at TIMESTAMPTZ,
  ADD COLUMN last_error TEXT;

ALTER TABLE notifications
  DROP CONSTRAINT notifications_delivery_status_check,
  ADD CONSTRAINT notifications_delivery_status_check
    CHECK (delivery_status IN ('pending', 'sending', 'sent', 'failed'));

CREATE INDEX notifications_due_idx
  ON notifications (scheduled_at, id)
  WHERE delivery_status = 'pending';
