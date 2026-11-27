ALTER TABLE notifications
  ADD COLUMN recipient_email VARCHAR(254) NULL,
  ADD COLUMN scheduled_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN claimed_at DATETIME(3) NULL,
  ADD COLUMN delivered_at DATETIME(3) NULL,
  ADD COLUMN last_error TEXT NULL;

ALTER TABLE notifications
  DROP CHECK notifications_chk_1,
  ADD CONSTRAINT notifications_delivery_status_check
    CHECK (delivery_status IN ('pending', 'sending', 'sent', 'failed'));

CREATE INDEX notifications_due_idx
  ON notifications (delivery_status, scheduled_at, id);
