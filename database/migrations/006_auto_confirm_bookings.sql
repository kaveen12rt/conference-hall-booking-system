CREATE TEMP TABLE bookings_auto_confirmed (
  id UUID PRIMARY KEY,
  contact_email TEXT NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL
) ON COMMIT DROP;

WITH updated AS (
  UPDATE bookings
  SET status = 'approved', updated_at = NOW()
  WHERE status = 'pending'
  RETURNING id, contact_email, booking_date, start_time
)
INSERT INTO bookings_auto_confirmed (id, contact_email, booking_date, start_time)
SELECT id, contact_email, booking_date, start_time
FROM updated;

UPDATE notifications n
SET event_type = CASE n.event_type
  WHEN 'booking_received' THEN 'booking_approved'
  WHEN 'new_booking_request' THEN 'new_booking_confirmed'
  WHEN 'booking_updated_pending' THEN 'booking_updated'
  WHEN 'booking_change_request' THEN 'booking_changed'
END
FROM bookings_auto_confirmed b
WHERE n.booking_id = b.id
  AND n.delivery_status IN ('pending', 'sending')
  AND n.event_type IN (
    'booking_received',
    'new_booking_request',
    'booking_updated_pending',
    'booking_change_request'
  );

INSERT INTO notifications (
  booking_id, event_type, channel, recipient_email, scheduled_at
)
SELECT b.id, 'booking_approved', 'email', b.contact_email, NOW()
FROM bookings_auto_confirmed b
WHERE NOT EXISTS (
  SELECT 1
  FROM notifications n
  WHERE n.booking_id = b.id
    AND n.event_type = 'booking_approved'
);

INSERT INTO notifications (
  booking_id, event_type, channel, recipient_email, scheduled_at
)
SELECT b.id, 'booking_reminder', 'email', b.contact_email,
       GREATEST(
         (b.booking_date + b.start_time) AT TIME ZONE 'Asia/Colombo'
           - INTERVAL '1 hour',
         NOW()
       )
FROM bookings_auto_confirmed b
WHERE (b.booking_date + b.start_time) > (NOW() AT TIME ZONE 'Asia/Colombo')
  AND NOT EXISTS (
    SELECT 1
    FROM notifications n
    WHERE n.booking_id = b.id
      AND n.event_type = 'booking_reminder'
      AND n.delivery_status IN ('pending', 'sending', 'sent')
  );
