import { decryptManageToken } from "./manage-token.js";
import { fileURLToPath } from "node:url";

const POLL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;
const EMBLEM_CID = "sri-lanka-state-emblem@conference-hall-booking";
const EMBLEM_PATH = fileURLToPath(
  new URL("./assets/sri-lanka-state-emblem.png", import.meta.url),
);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function messageFor(notification, { tokenEncryptionSecret, frontendOrigin }) {
  const date = notification.date;
  const time = `${notification.startTime.slice(0, 5)}–${notification.endTime.slice(0, 5)}`;

  const subjects = {
    booking_received: "Booking request received",
    new_booking_request: "New request for review",
    booking_updated: "Booking request updated",
    booking_updated_pending: "Changes require approval",
    booking_change_request: "Booking changed — review required",
    requester_booking_cancelled: "Requester cancellation notice",
    booking_reopened: "Cancelled booking reopened",
    booking_reopened_admin: "Booking restored for review",
    booking_approved: "Booking approved",
    booking_rejected: "Request not approved",
    booking_cancelled: "Booking cancelled",
    booking_reminder: "Meeting reminder",
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
    booking_updated: [
      "Your pending conference hall booking request has been updated.",
      "ඔබගේ පොරොත්තු සම්මන්ත්‍රණ ශාලා ඉල්ලීම යාවත්කාලීන කර ඇත.",
    ],
    booking_updated_pending: [
      "Your approved booking was changed and has returned to pending review. It must be approved again.",
      "ඔබගේ අනුමත වෙන්කිරීම වෙනස් කර ඇති බැවින් එය නැවත සමාලෝචනය සඳහා පොරොත්තු තත්ත්වයට පත් කර ඇත.",
    ],
    booking_change_request: [
      `The requester ${notification.contactName} (${notification.contactEmail}) changed a booking. Review the updated request.`,
      `${notification.contactName} (${notification.contactEmail}) වෙන්කිරීමක් වෙනස් කර ඇත. යාවත්කාලීන ඉල්ලීම සමාලෝචනය කරන්න.`,
    ],
    requester_booking_cancelled: [
      `The requester ${notification.contactName} (${notification.contactEmail}) cancelled their booking.`,
      `${notification.contactName} (${notification.contactEmail}) විසින් වෙන්කිරීම අවලංගු කර ඇත.`,
    ],
    booking_reopened: [
      "Your cancelled conference hall booking has been reopened as a pending request and requires admin approval.",
      "ඔබ අවලංගු කළ සම්මන්ත්‍රණ ශාලා වෙන්කිරීම නැවත ඉල්ලීමක් ලෙස විවෘත කර ඇත. එය පරිපාලක අනුමැතියට යොමු කර ඇත.",
    ],
    booking_reopened_admin: [
      `A cancelled booking from ${notification.contactName} (${notification.contactEmail}) has been reopened and needs review.`,
      `${notification.contactName} (${notification.contactEmail}) විසින් අවලංගු කළ වෙන්කිරීමක් නැවත විවෘත කර ඇත. එය සමාලෝචනය කරන්න.`,
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
  const subject = subjects[notification.event_type];
  const introduction = introductions[notification.event_type];
  if (!subject || !introduction) {
    throw new Error(`Unsupported email notification event: ${notification.event_type}`);
  }

  const managementLink = notification.manage_token_encrypted
    ? new URL(
        `/#manage=${encodeURIComponent(
          decryptManageToken(notification.manage_token_encrypted, tokenEncryptionSecret),
        )}`,
        frontendOrigin,
      ).toString()
    : null;

  const detailRows = [
    ["Meeting", "රැස්වීම", notification.meetingTitle],
    ["Hall", "ශාලාව", notification.hallName],
    ...(notification.contactDesignation
      ? [["Requester designation", "ඉල්ලුම්කරුගේ තනතුර", notification.contactDesignation]]
      : []),
    ["Date", "දිනය", date],
    ["Time", "වේලාව", `${time} (Sri Lanka time / ශ්‍රී ලංකා වේලාව)`],
  ];
  const text = [
    "GOVERNMENT OF SRI LANKA | Ministry of Digital Economy",
    "ශ්‍රී ලංකා රජය | ඩිජිටල් ආර්ථික අමාත්‍යාංශය",
    "CONFERENCE HALL BOOKING SERVICE",
    "",
    subject,
    "",
    ...introduction,
    "",
    "BOOKING DETAILS / වෙන්කිරීමේ විස්තර",
    ...detailRows.map(([label, sinhalaLabel, value]) =>
      `${label} / ${sinhalaLabel}: ${value}`,
    ),
    ...(managementLink
      ? [
          "",
          "SECURE BOOKING MANAGEMENT / ආරක්ෂිත වෙන්කිරීම් කළමනාකරණය",
          "Use the secure link below to manage this request:",
          managementLink,
          "Keep this link private. Anyone with it can manage this booking.",
        ]
      : []),
    "",
    "This is an automated notification from the Conference Hall Booking Service.",
    "මෙය සම්මන්ත්‍රණ ශාලා වෙන්කිරීමේ සේවාව මඟින් ස්වයංක්‍රීයව එවන ලද දැනුම්දීමකි.",
    "",
    "Ministry of Digital Economy | Government of Sri Lanka",
    "ඩිජිටල් ආර්ථික අමාත්‍යාංශය | ශ්‍රී ලංකා රජය",
  ].join("\n");

  const htmlDetailRows = detailRows.map(([label, sinhalaLabel, value]) => `
    <tr>
      <th align="left" style="padding:10px 12px;border-bottom:1px solid #e6ebf1;color:#566579;font-size:13px;font-weight:600;vertical-align:top;">
        ${label}<br><span lang="si" style="color:#738196;font-weight:400;">${sinhalaLabel}</span>
      </th>
      <td style="padding:10px 12px;border-bottom:1px solid #e6ebf1;color:#172b4d;font-size:14px;line-height:1.55;vertical-align:top;">
        ${escapeHtml(value)}
      </td>
    </tr>`).join("");
  const secureLinkHtml = managementLink
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;border:1px solid #d6e3f0;border-radius:8px;background:#f4f8fc;">
        <tr><td style="padding:18px 20px;">
          <strong style="display:block;color:#173d69;font-size:14px;">Secure booking management / ආරක්ෂිත වෙන්කිරීම් කළමනාකරණය</strong>
          <p style="margin:8px 0 14px;color:#40546e;font-size:14px;line-height:1.6;">Use this private link to manage your request. / ඔබගේ ඉල්ලීම කළමනාකරණය කිරීමට මෙම පුද්ගලික සබැඳිය භාවිතා කරන්න.</p>
          <a href="${escapeHtml(managementLink)}" style="display:inline-block;padding:11px 18px;border-radius:5px;background:#173d69;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Manage booking / වෙන්කිරීම කළමනාකරණය</a>
          <p style="margin:12px 0 0;color:#64748b;font-size:12px;line-height:1.55;">Keep this link private. Anyone with it can manage this booking.<br>මෙම සබැඳිය පුද්ගලිකව තබාගන්න.</p>
        </td></tr>
      </table>`
    : "";
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:24px 12px;background:#f1f4f8;font-family:Arial,Helvetica,sans-serif;color:#172b4d;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dce3eb;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:22px 28px;border-bottom:4px solid #c99a2e;">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr>
          <td style="padding-right:16px;vertical-align:middle;"><img src="cid:${EMBLEM_CID}" width="43" height="61" alt="State Emblem of Sri Lanka / ශ්‍රී ලංකා රාජ්‍ය ලාංඡනය" style="display:block;width:43px;height:61px;border:0;"></td>
          <td style="vertical-align:middle;">
            <div style="color:#173d69;font-size:12px;font-weight:700;letter-spacing:1px;">GOVERNMENT OF SRI LANKA</div>
            <div lang="si" style="margin-top:4px;color:#40546e;font-size:13px;">ශ්‍රී ලංකා රජය</div>
            <div style="margin-top:8px;color:#172b4d;font-size:14px;font-weight:700;">Ministry of Digital Economy</div>
            <div lang="si" style="margin-top:3px;color:#40546e;font-size:13px;">ඩිජිටල් ආර්ථික අමාත්‍යාංශය</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 28px 30px;">
        <div style="margin-bottom:8px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;">CONFERENCE HALL BOOKING SERVICE</div>
        <h1 style="margin:0 0 16px;color:#173d69;font-size:22px;line-height:1.35;">${escapeHtml(subject)}</h1>
        <p style="margin:0 0 8px;color:#293b52;font-size:14px;line-height:1.65;">${escapeHtml(introduction[0])}</p>
        <p lang="si" style="margin:0 0 22px;color:#40546e;font-size:14px;line-height:1.75;">${escapeHtml(introduction[1])}</p>
        <h2 style="margin:0 0 8px;color:#173d69;font-size:14px;">Booking details / වෙන්කිරීමේ විස්තර</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e6ebf1;border-radius:7px;border-spacing:0;">
          <tbody>${htmlDetailRows}
          </tbody>
        </table>
        ${secureLinkHtml}
        <p style="margin:24px 0 4px;color:#64748b;font-size:12px;line-height:1.6;">This is an automated notification from the Conference Hall Booking Service.</p>
        <p lang="si" style="margin:0;color:#64748b;font-size:12px;line-height:1.7;">මෙය සම්මන්ත්‍රණ ශාලා වෙන්කිරීමේ සේවාව මඟින් ස්වයංක්‍රීයව එවන ලද දැනුම්දීමකි.</p>
      </td></tr>
      <tr><td style="padding:16px 28px;background:#f6f8fb;border-top:1px solid #e6ebf1;color:#52647c;font-size:12px;line-height:1.65;">
        Ministry of Digital Economy | Government of Sri Lanka<br>
        <span lang="si">ඩිජිටල් ආර්ථික අමාත්‍යාංශය | ශ්‍රී ලංකා රජය</span>
      </td></tr>
    </table>
  </body>
</html>`;

  return {
    subject: `Conference Hall Booking | ${subject}`,
    text,
    html,
    attachments: [{
      filename: "sri-lanka-state-emblem.png",
      path: EMBLEM_PATH,
      cid: EMBLEM_CID,
      contentType: "image/png",
      contentDisposition: "inline",
    }],
  };
}

export async function processEmailNotifications({
  database,
  transporter,
  from,
  tokenEncryptionSecret,
  frontendOrigin = "http://127.0.0.1:5173",
  logger = console,
}) {
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
              n.manage_token_encrypted,
              b.status AS "bookingStatus",
              b.meeting_title AS "meetingTitle",
              b.contact_name AS "contactName",
              b.contact_designation AS "contactDesignation",
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
      const { subject, text, html, attachments } = messageFor(notification, {
        tokenEncryptionSecret,
        frontendOrigin,
      });
      await transporter.sendMail({
        from,
        to: notification.recipient_email,
        subject,
        text,
        html,
        attachments,
      });
      await database.query(
        `UPDATE notifications
         SET delivery_status = 'sent', claimed_at = NULL, delivered_at = NOW(),
             last_error = NULL, manage_token_encrypted = NULL
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
