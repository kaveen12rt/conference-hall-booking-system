DROP TEMPORARY TABLE IF EXISTS bookings_auto_confirmed;

CREATE TEMPORARY TABLE bookings_auto_confirmed (
  id CHAR(36) PRIMARY KEY,
  contact_email VARCHAR(254) NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO bookings_auto_confirmed (id, contact_email, booking_date, start_time)
SELECT id, contact_email, booking_date, start_time
FROM bookings
WHERE status = 'pending';

UPDATE bookings
SET status = 'approved', updated_at = UTC_TIMESTAMP(3)
WHERE status = 'pending';

UPDATE notifications n
JOIN bookings_auto_confirmed b ON n.booking_id = b.id
SET n.event_type = CASE n.event_type
  WHEN 'booking_received' THEN 'booking_approved'
  WHEN 'new_booking_request' THEN 'new_booking_confirmed'
  WHEN 'booking_updated_pending' THEN 'booking_updated'
  WHEN 'booking_change_request' THEN 'booking_changed'
END
WHERE n.delivery_status IN ('pending', 'sending')
  AND n.event_type IN (
    'booking_received',
    'new_booking_request',
    'booking_updated_pending',
    'booking_change_request'
  );

INSERT INTO notifications (
  id, booking_id, event_type, channel, recipient_email, scheduled_at
)
SELECT UUID(), b.id, 'booking_approved', 'email', b.contact_email, UTC_TIMESTAMP(3)
FROM bookings_auto_confirmed b
WHERE NOT EXISTS (
  SELECT 1
  FROM notifications n
  WHERE n.booking_id = b.id
    AND n.event_type = 'booking_approved'
);

INSERT INTO notifications (
  id, booking_id, event_type, channel, recipient_email, scheduled_at
)
SELECT UUID(), b.id, 'booking_reminder', 'email', b.contact_email,
       GREATEST(
         DATE_SUB(TIMESTAMP(b.booking_date, b.start_time), INTERVAL 390 MINUTE),
         UTC_TIMESTAMP(3)
       )
FROM bookings_auto_confirmed b
WHERE TIMESTAMP(b.booking_date, b.start_time) > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)
  AND NOT EXISTS (
    SELECT 1
    FROM notifications n
    WHERE n.booking_id = b.id
      AND n.event_type = 'booking_reminder'
      AND n.delivery_status IN ('pending', 'sending', 'sent')
  );

DROP TEMPORARY TABLE bookings_auto_confirmed;
