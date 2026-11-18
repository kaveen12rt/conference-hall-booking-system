import { useEffect, useState } from "react";
import LiveCalendar from "../components/LiveCalendar.jsx";
import { apiRequest, getErrorMessage } from "../services/api.js";
import { SitePreferences, usePreferences } from "../context/PreferencesContext.jsx";

const EMPTY_HALL_FORM = {
  name: "",
  capacity: "",
  description: "",
  facilities: [],
  otherFacility: "",
};

const COMMON_FACILITIES = [
  "Projector",
  "Wi-Fi",
  "Sound system",
  "Microphone",
  "Smart board",
  "TV",
  "Video conferencing",
  "Air conditioning",
  "Whiteboard",
];

export default function AdminPage() {
  const { language, t } = usePreferences();
  const [admin, setAdmin] = useState(null);
  const [emailDeliveryConfigured, setEmailDeliveryConfigured] = useState(false);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [notificationError, setNotificationError] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [halls, setHalls] = useState([]);
  const [hallForm, setHallForm] = useState(EMPTY_HALL_FORM);
  const [otherFacilityEnabled, setOtherFacilityEnabled] = useState(false);
  const [calendarHallId, setCalendarHallId] = useState("");
  const [calendarSelectedDate, setCalendarSelectedDate] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [hallError, setHallError] = useState("");
  const [hallMessage, setHallMessage] = useState("");
  const [hallSubmitting, setHallSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest("/api/admin/auth/me")
      .then((result) => {
        if (active) {
          setAdmin(result.admin);
          setEmailDeliveryConfigured(result.emailDeliveryConfigured);
        }
      })
      .catch(() => {
        if (active) {
          setAdmin(null);
          setEmailDeliveryConfigured(false);
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    if (!admin) {
      setPendingBookings([]);
      setPendingCount(0);
      setNotificationError("");
      setNotificationsOpen(false);
      return undefined;
    }

    let active = true;
    let timer;

    async function refreshNotifications() {
      try {
        const result = await apiRequest("/api/admin/notifications");
        if (active) {
          setPendingBookings(result.pendingBookings);
          setPendingCount(result.pendingCount);
          setNotificationError("");
        }
      } catch (requestError) {
        if (active) setNotificationError(getErrorMessage(requestError));
      } finally {
        if (active) timer = setTimeout(refreshNotifications, 30_000);
      }
    }

    refreshNotifications();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [admin, t]);

  useEffect(() => {
    if (!admin) return undefined;

    let active = true;
    apiRequest("/api/halls")
      .then((result) => {
        if (active) setHalls(result.halls);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError));
      });

    return () => {
      active = false;
    };
  }, [admin, t]);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest("/api/admin/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setAdmin(result.admin);
      setEmailDeliveryConfigured(result.emailDeliveryConfigured);
      setPassword("");
      setMessage("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/admin/auth/logout", { method: "POST" });
      setAdmin(null);
      setEmailDeliveryConfigured(false);
      setPassword("");
      setMessage("You have been signed out.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/api/admin/auth/password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed. Your other admin sessions have been revoked.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function updateHallField(event) {
    const { name, value } = event.target;
    setHallForm((current) => ({ ...current, [name]: value }));
  }

  function updateHallFacility(event) {
    const { checked, value } = event.target;
    setHallForm((current) => ({
      ...current,
      facilities: checked
        ? [...current.facilities, value]
        : current.facilities.filter((facility) => facility !== value),
    }));
  }

  async function addHall(event) {
    event.preventDefault();
    setHallSubmitting(true);
    setHallError("");
    setHallMessage("");

    try {
      const result = await apiRequest("/api/admin/halls", {
        method: "POST",
        body: {
          ...hallForm,
          capacity: Number(hallForm.capacity),
          facilities: [...new Set([
            ...hallForm.facilities,
            ...(hallForm.otherFacility.trim() ? [hallForm.otherFacility.trim()] : []),
          ])],
        },
      });
      setHalls((current) => [...current, result.hall]);
      setCalendarHallId(result.hall.id);
      setHallForm(EMPTY_HALL_FORM);
      setOtherFacilityEnabled(false);
      setHallMessage("Hall added successfully.");
    } catch (requestError) {
      setHallError(getErrorMessage(requestError));
    } finally {
      setHallSubmitting(false);
    }
  }

  function openPendingBooking(booking) {
    setCalendarHallId(booking.hallId);
    setCalendarSelectedDate(booking.date);
    setNotificationsOpen(false);
    document.getElementById("admin-calendar-heading")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function formatNotificationDate(date) {
    return new Intl.DateTimeFormat(language === "si" ? "si-LK" : "en-LK", {
      dateStyle: "medium",
      timeZone: "Asia/Colombo",
    }).format(new Date(`${date}T12:00:00+05:30`));
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label={t("Public booking")}>
          <img
            className="brand-emblem"
            src="/sri-lanka-state-emblem.svg"
            alt=""
            aria-hidden="true"
          />
          <span>
            <strong>{t("Conference Hall Booking")}</strong>
            <small>{t("Administrator access")}</small>
          </span>
        </a>
        <div className="header-actions">
          {admin && (
            <div className="notification-menu">
              <button
                className="notification-button"
                type="button"
                aria-label={`${t("Notifications")}${pendingCount ? `, ${pendingCount} ${t("Pending booking requests")}` : ""}`}
                aria-expanded={notificationsOpen}
                aria-controls="admin-notifications"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M10 21h4" />
                </svg>
                {pendingCount > 0 && (
                  <span className="notification-badge" aria-hidden="true">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <section
                  className="notification-popover"
                  id="admin-notifications"
                  aria-label={t("Notifications")}
                >
                  <div className="notification-popover-heading">
                    <div>
                      <h2>{t("Notifications")}</h2>
                      <p>{t("Pending booking requests")}</p>
                    </div>
                    <span className="notification-total">{pendingCount}</span>
                  </div>
                  {notificationError ? (
                    <p className="notification-state" role="alert">{t(notificationError)}</p>
                  ) : pendingBookings.length === 0 ? (
                    <p className="notification-state">{t("You’re all caught up. No pending booking requests.")}</p>
                  ) : (
                    <ul className="notification-list">
                      {pendingBookings.map((booking) => (
                        <li key={booking.id}>
                          <button
                            className="notification-item"
                            type="button"
                            onClick={() => openPendingBooking(booking)}
                          >
                            <span className="notification-item-indicator" aria-hidden="true" />
                            <span className="notification-item-content">
                              <strong>{booking.meetingTitle}</strong>
                              {booking.contactDesignation && (
                                <span>{booking.contactDesignation}</span>
                              )}
                              <span>{booking.hallName}</span>
                              <small>
                                {formatNotificationDate(booking.date)} · {booking.startTime}–{booking.endTime}
                              </small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {pendingCount > pendingBookings.length && (
                    <p className="notification-more">
                      {t("Showing the 10 most recent requests. Review the calendar for all bookings.")}
                    </p>
                  )}
                </section>
              )}
            </div>
          )}
          <SitePreferences />
          <a className="quiet-link" href="/">{t("Public booking")}</a>
        </div>
      </header>

      <main className="content admin-content">
        <section className="intro-block">
          <p className="eyebrow">{t("Restricted access")}</p>
          <h1>{t("Administrator")}</h1>
          <p>{t("Administrator accounts are provisioned by an authorized operator. Public registration is not available.")}</p>
        </section>

        <section className="panel admin-panel" aria-labelledby="admin-heading">
          {checkingSession ? (
            <p role="status">{t("Checking session…")}</p>
          ) : admin ? (
            <>
              <div className="panel-heading">
                <div>
                  <h2 id="admin-heading">{t("Signed in")}</h2>
                  <p>{admin.username}</p>
                </div>
                <button className="secondary-button" type="button" onClick={logout} disabled={busy}>
                  {t("Sign out")}
                </button>
              </div>

              <p className="notice">
                {emailDeliveryConfigured
                  ? t("Review pending bookings in the calendar. Approval and decision emails are queued for requesters.")
                  : t("Review pending bookings in the calendar. Email notifications are not configured, so requesters will not receive decision emails.")}
              </p>

              <section className="hall-management" aria-labelledby="hall-management-heading">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{t("Facilities")}</p>
                    <h2 id="hall-management-heading">{t("Add a conference hall")}</h2>
                    <p>{t("New halls become active on the public booking form.")}</p>
                  </div>
                </div>
                <form className="form-grid" onSubmit={addHall}>
                  <label className="field" htmlFor="hall-name">
                    <span>{t("Hall name")}</span>
                    <input
                      id="hall-name"
                      name="name"
                      value={hallForm.name}
                      onChange={updateHallField}
                      minLength={2}
                      maxLength={120}
                      required
                    />
                  </label>
                  <label className="field" htmlFor="hall-capacity">
                    <span>{t("Capacity")}</span>
                    <input
                      id="hall-capacity"
                      name="capacity"
                      type="number"
                      value={hallForm.capacity}
                      onChange={updateHallField}
                      min="1"
                      max="10000"
                      step="1"
                      required
                    />
                  </label>
                  <label className="field full-width" htmlFor="hall-description">
                    <span>{t("Description")}</span>
                    <textarea
                      id="hall-description"
                      name="description"
                      value={hallForm.description}
                      onChange={updateHallField}
                      maxLength={2000}
                      rows={3}
                    />
                  </label>
                  <fieldset className="facility-picker full-width">
                    <legend>{t("Facilities")}</legend>
                    <div className="facility-options">
                      {COMMON_FACILITIES.map((facility) => (
                        <label className="facility-option" key={facility}>
                          <input
                            type="checkbox"
                            value={facility}
                            checked={hallForm.facilities.includes(facility)}
                            onChange={updateHallFacility}
                            disabled={hallSubmitting}
                          />
                          <span>{t(facility)}</span>
                        </label>
                      ))}
                      <label className="facility-option">
                        <input
                          type="checkbox"
                          checked={otherFacilityEnabled}
                          onChange={(event) => {
                            setOtherFacilityEnabled(event.target.checked);
                            if (!event.target.checked) {
                              setHallForm((current) => ({ ...current, otherFacility: "" }));
                            }
                          }}
                          disabled={hallSubmitting}
                        />
                        <span>{t("Other")}</span>
                      </label>
                    </div>
                    {otherFacilityEnabled && (
                      <label className="field other-facility-field" htmlFor="hall-other-facility">
                        <span>{t("Other facility")}</span>
                        <input
                          id="hall-other-facility"
                          name="otherFacility"
                          value={hallForm.otherFacility}
                          onChange={updateHallField}
                          maxLength={80}
                          required
                          disabled={hallSubmitting}
                        />
                      </label>
                    )}
                  </fieldset>
                  {hallError && (
                    <p className="notice error full-width" role="alert">{t(hallError)}</p>
                  )}
                  {hallMessage && (
                    <p className="notice success full-width" role="status">{t(hallMessage)}</p>
                  )}
                  <div className="form-actions full-width">
                    <button className="primary-button" type="submit" disabled={hallSubmitting}>
                      {hallSubmitting ? t("Adding hall…") : t("Add hall")}
                    </button>
                  </div>
                </form>

                <div className="hall-list" aria-live="polite">
                  <h3>{t("Active halls")} ({halls.length})</h3>
                  {halls.length === 0 ? (
                    <p>{t("No halls have been added yet.")}</p>
                  ) : (
                    <ul>
                      {halls.map((hall) => (
                        <li key={hall.id}>
                          <strong>{hall.name}</strong>
                          <span>{t("Capacity")} {hall.capacity}</span>
                          {hall.facilities.length > 0 && (
                            <span>{hall.facilities.join(", ")}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <LiveCalendar
                view="admin"
                halls={halls}
                selectedHallId={calendarHallId}
                onHallChange={setCalendarHallId}
                selectedDate={calendarSelectedDate || undefined}
                onDateChange={setCalendarSelectedDate}
              />

              <form className="stacked-form password-form" onSubmit={changePassword}>
                <h3>{t("Change password")}</h3>
                <label className="field" htmlFor="admin-current-password">
                  <span>{t("Current password")}</span>
                  <input
                    id="admin-current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label className="field" htmlFor="admin-new-password">
                  <span>{t("New password")}</span>
                  <input
                    id="admin-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={72}
                    required
                  />
                  <small>{t("Use at least 12 characters. Passwords are limited to 72 UTF-8 bytes.")}</small>
                </label>
                <button className="primary-button" type="submit" disabled={busy}>
                  {busy ? t("Saving…") : t("Update password")}
                </button>
              </form>
            </>
          ) : (
            <form className="stacked-form admin-login-form" onSubmit={login}>
              <h2 id="admin-heading">{t("Admin sign in")}</h2>
              <label className="field" htmlFor="admin-username">
                <span>{t("Username")}</span>
                <input
                  id="admin-username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  minLength={3}
                  maxLength={32}
                  pattern="[A-Za-z0-9][A-Za-z0-9._\\-]*"
                  title={t("Use 3-32 letters, numbers, dots, underscores, or hyphens.")}
                  required
                />
              </label>
              <label className="field" htmlFor="admin-password">
                <span>{t("Password")}</span>
                <input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? t("Signing in…") : t("Sign in")}
              </button>
            </form>
          )}
          {error && <p className="notice error" role="alert">{t(error)}</p>}
          {message && <p className="notice success" role="status">{t(message)}</p>}
        </section>
      </main>
      <footer className="site-footer">{t("Authorized administrators only.")}</footer>
    </div>
  );
}
