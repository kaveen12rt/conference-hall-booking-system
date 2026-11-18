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
    throw new Error(result.error?.code ?? "REQUEST_FAILED");
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
    BOOKING_DATE_PASSED: "A booking in the past cannot be reopened.",
    BOOKING_STATUS_CONFLICT: "This booking was already updated. Refresh the calendar before trying again.",
    BOOKING_TIME_UNAVAILABLE: "That time was just booked. Refresh the calendar and choose another time.",
    BOOKING_UPDATED_PENDING: "Your changes were submitted for approval. The booking is pending again.",
    HALL_UNAVAILABLE: "That hall is unavailable or cannot accommodate the participants.",
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
