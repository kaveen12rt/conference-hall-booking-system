const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3000";

export async function apiRequest(path, { body, ...options } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...options.headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (response.status === 204) {
    return null;
  }

  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error?.code ?? "REQUEST_FAILED");
    error.details = result.error?.details;
    throw error;
  }
  return result;
}

export function getErrorMessage(error) {
  const messages = {
    ADMIN_AUTH_REQUIRED: "Please sign in with an administrator account.",
    BOOKING_RATE_LIMIT_EXCEEDED: "Too many booking attempts. Please try again later.",
    BOOKING_MANAGEMENT_NOT_FOUND: "This secure booking link is invalid or has expired.",
    BOOKING_MANAGEMENT_RATE_LIMIT_EXCEEDED: "Too many booking management attempts. Please try again later.",
    BOOKING_NOT_EDITABLE: "This booking is no longer available for editing.",
    BOOKING_NOT_CANCELLABLE: "This booking cannot be cancelled in its current state.",
    BOOKING_CANCELLATION_TOO_LATE: "An approved booking can only be changed or cancelled more than one hour before it starts.",
    BOOKING_DATE_PASSED: "Past dates cannot be booked. Choose today or a future date.",
    BOOKING_START_TIME_PASSED: "That start time has passed. Choose a future 15-minute time slot.",
    BOOKING_STATUS_CONFLICT: "This booking was already updated. Refresh the calendar before trying again.",
    BOOKING_TIME_UNAVAILABLE: "That time was just booked. Refresh the calendar and choose another time.",
    BOOKING_UPDATED_PENDING: "Your changes were submitted for approval. The booking is pending again.",
    HALL_UNAVAILABLE: "That hall is unavailable or cannot accommodate the participants.",
    HALL_NOT_FOUND: "That conference hall could not be found. Refresh the hall list and try again.",
    HALL_CAPACITY_CONFLICT: "Capacity cannot be reduced below the participant count of an upcoming confirmed booking.",
    MAINTENANCE_TIME_UNAVAILABLE: "This time is unavailable because the hall is scheduled for maintenance.",
    MAINTENANCE_BOOKING_CONFLICT: "Existing bookings overlap this maintenance period.",
    MAINTENANCE_WINDOW_CONFLICT: "This period overlaps another scheduled maintenance window.",
    INVALID_MAINTENANCE_WINDOW: "Choose a future maintenance period using 15-minute time increments.",
    MAINTENANCE_WINDOW_NOT_FOUND: "That scheduled maintenance period was not found. Refresh the hall list.",
    INVALID_HALL_STATUS: "Choose whether the hall should be active or inactive.",
    INVALID_MAINTENANCE_STATUS: "Choose whether new bookings should be paused or resumed.",
    INVALID_HALL: "Check the hall name, capacity, description, and facilities.",
    INVALID_BOOKING: "Check the form details and try again.",
    INVALID_BOOKING_STATUS: "The requested booking status is not valid.",
    INVALID_CREDENTIALS: "The username or password is incorrect.",
    INVALID_PASSWORD: "Use a password of 12 to 72 UTF-8 bytes.",
    LOGIN_RATE_LIMIT_EXCEEDED: "Too many login attempts. Please wait before trying again.",
    ORIGIN_NOT_ALLOWED: "This request was blocked. Reload the page and try again.",
    PASSWORD_UNCHANGED: "Choose a new password different from your current password.",
    CURRENT_PASSWORD_INVALID: "The current password is incorrect.",
    RATE_LIMIT_EXCEEDED: "There have been many requests from this browser. Please wait a few minutes and try again.",
    STATUS_RATE_LIMIT_EXCEEDED: "Too many status checks. Please try again later.",
  };

  return messages[error.message] ?? "The request could not be completed. Please try again.";
}
