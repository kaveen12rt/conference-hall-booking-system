const POLL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;

function messageFor(notification) {
  const date = notification.date;
  const time = `${notification.startTime.slice(0, 5)}–${notification.endTime.slice(0, 5)}`;
  const details = [
    `Meeting: ${notification.meetingTitle}`,
    `Hall: ${notification.hallName}`,
    `Date: ${date}`,
    `Time: ${time} (Sri Lanka time)`,
  ];

  const subjects = {
    booking_received: "Booking request received",
    new_booking_request: "New conference hall booking request",
    booking_approved: "Conference hall booking approved",
    booking_rejected: "Conference hall booking update",
    booking_cancelled: "Conference hall booking cancelled",
    booking_reminder: "Conference hall meeting reminder",
  };
  const introductions = {
    booking_received: [
      "Your conference hall request has been received and is pending review.",
      "ඔබගේ සම්මන්ත්‍රණ ශාලා ඉල්ලීම ලැබී ඇති අතර සමාලෝචනය සඳහා යොමු කර ඇත.",
    ],
    new_booking_request: [
      `A new booking request was submitted by ${notification.contactName} (${notification.contactEmail}).`,
      `${notification.contactName} (${notification.contactEmail}) විසින් නව වෙන්කිරීමේ ඉල්ලීමක් යොමු කර ඇත.`,
    ],
    booking_approved: [
      "Your conference hall booking has been approved.",
      "ඔබගේ සම්මන්ත්‍රණ ශාලා වෙන්කිරීම අනුමත කර ඇත.",
    ],
    booking_rejected: [
      "Your conference hall booking request was not approved.",
      "ඔබගේ සම්මන්ත්‍රණ ශාලා වෙන්කිරීමේ ඉල්ලීම අනුමත කර නොමැත.",
    ],
    booking_cancelled: [
      "Your conference hall booking has been cancelled.",
      "ඔබගේ සම්මන්ත්‍රණ ශාලා වෙන්කිරීම අවලංගු කර ඇත.",
    ],
    booking_reminder: [
      "This is a reminder that your approved meeting is scheduled in one hour.",
      "ඔබගේ අනුමත රැස්වීම තව පැයකින් ආරම්භ වීමට නියමිත බව මතක් කරමු.",
    ],
  };

  return {
    subject: subjects[notification.event_type],
    text: [
      ...introductions[notification.event_type],
      "",
      ...details.map((detail) => {
        const [label, value] = detail.split(": ");
        const translatedLabels = {
          Meeting: "රැස්වීම",
          Hall: "ශාලාව",
          Date: "දිනය",
          Time: "වේලාව",
        };
        return `${label} / ${translatedLabels[label]}: ${value}`;
      }),
      "",
      "Conference Hall Booking System — Ministry of Digital Economy, Sri Lanka",
      "සම්මන්ත්‍රණ ශාලා වෙන්කිරීම් පද්ධතිය — ඩිජිටල් ආර්ථික අමාත්‍යාංශය, ශ්‍රී ලංකාව",
    ].join("\n"),
  };
}

export async function processEmailNotifications({ database, transporter, from, logger = console }) {
  let claimed;
  try {
    await database.query(
      `UPDATE notifications
       SET delivery_status = 'pending', claimed_at = NULL
       WHERE delivery_status = 'sending'
         AND claimed_at < NOW() - INTERVAL '5 minutes'`,
    );
    claimed = await database.query(
      `WITH due AS (
         SELECT id
         FROM notifications
         WHERE channel = 'email'
           AND delivery_status = 'pending'
           AND scheduled_at <= NOW()
         ORDER BY scheduled_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE notifications AS notification
       SET delivery_status = 'sending',
           claimed_at = NOW(),
           attempts = attempts + 1
       FROM due
       WHERE notification.id = due.id
       RETURNING notification.id`,
      [BATCH_SIZE],
    );
  } catch (error) {
    logger.error("Could not claim queued email notifications:", error);
    return;
  }

  if (claimed.rowCount === 0) return;
  const ids = claimed.rows.map(({ id }) => id);
  let notifications;
  try {
    notifications = await database.query(
      `SELECT n.id, n.event_type, n.recipient_email, n.attempts,
              b.status AS "bookingStatus",
              b.meeting_title AS "meetingTitle",
              b.contact_name AS "contactName",
              b.contact_email AS "contactEmail",
              b.booking_date::text AS date,
              TO_CHAR(b.start_time, 'HH24:MI') AS "startTime",
              TO_CHAR(b.end_time, 'HH24:MI') AS "endTime",
              h.name AS "hallName"
       FROM notifications n
       JOIN bookings b ON b.id = n.booking_id
       JOIN conference_halls h ON h.id = b.hall_id
       WHERE n.id = ANY($1::uuid[])`,
      [ids],
    );
  } catch (error) {
    logger.error("Could not load queued email notification details:", error);
    await database.query(
      `UPDATE notifications
       SET delivery_status = 'pending', claimed_at = NULL
       WHERE id = ANY($1::uuid[]) AND delivery_status = 'sending'`,
      [ids],
    );
    return;
  }

  for (const notification of notifications.rows) {
    if (!notification.recipient_email) {
      await database.query(
        `UPDATE notifications
         SET delivery_status = 'failed', claimed_at = NULL,
             last_error = 'Recipient email is not configured'
         WHERE id = $1`,
        [notification.id],
      );
      logger.error(`Email notification ${notification.id} has no recipient.`);
      continue;
    }

    if (
      notification.event_type === "booking_reminder" &&
      notification.bookingStatus !== "approved"
    ) {
      await database.query(
        `UPDATE notifications
         SET delivery_status = 'failed', claimed_at = NULL,
             last_error = 'Booking is no longer approved'
         WHERE id = $1`,
        [notification.id],
      );
      continue;
    }

    try {
      const { subject, text } = messageFor(notification);
      await transporter.sendMail({
        from,
        to: notification.recipient_email,
        subject,
        text,
      });
      await database.query(
        `UPDATE notifications
         SET delivery_status = 'sent', claimed_at = NULL, delivered_at = NOW(),
             last_error = NULL
         WHERE id = $1`,
        [notification.id],
      );
    } catch (error) {
      const retry = notification.attempts < MAX_ATTEMPTS;
      const errorText = String(error.code ?? error.message ?? "Email delivery failed").slice(0, 500);
      await database.query(
        `UPDATE notifications
         SET delivery_status = $2,
             claimed_at = NULL,
             scheduled_at = CASE
               WHEN $2 = 'pending'
                 THEN NOW() + ($3 * INTERVAL '1 minute')
               ELSE scheduled_at
             END,
             last_error = $4
         WHERE id = $1`,
        [
          notification.id,
          retry ? "pending" : "failed",
          Math.min(2 ** notification.attempts, 60),
          errorText,
        ],
      );
      logger.error(`Email notification ${notification.id} delivery failed: ${errorText}`);
    }
  }
}

export function startEmailNotificationWorker(options) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processEmailNotifications(options);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(run, POLL_INTERVAL_MS);
  timer.unref();
  void run().catch((error) => {
    options.logger?.error("Email notification worker stopped unexpectedly:", error);
  });
  return () => clearInterval(timer);
}
