import { useEffect, useState } from "react";
import LiveCalendar from "../components/LiveCalendar.jsx";
import AdminMonthlyReport from "../components/AdminMonthlyReport.jsx";
import { apiRequest, getErrorMessage } from "../services/api.js";
import { SitePreferences, usePreferences } from "../context/PreferencesContext.jsx";

const adminPath = window.location.pathname.replace(/\/+$/, "");
const adminPage = {
  "/admin": "dashboard",
  "/admin/halls/new": "addHall",
  "/admin/halls": "halls",
  "/admin/reports": "reports",
  "/admin/password": "password",
}[adminPath] ?? "dashboard";
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
  const [recentBookings, setRecentBookings] = useState([]);
  const [recentBookingCount, setRecentBookingCount] = useState(0);
  const [notificationError, setNotificationError] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [halls, setHalls] = useState([]);
  const [hallForm, setHallForm] = useState(EMPTY_HALL_FORM);
  const [otherFacilityEnabled, setOtherFacilityEnabled] = useState(false);
  const [editingHallId, setEditingHallId] = useState("");
  const [editHallForm, setEditHallForm] = useState(null);
  const [maintenanceSchedulingHallId, setMaintenanceSchedulingHallId] = useState("");
  const [maintenanceWindowForm, setMaintenanceWindowForm] = useState({
    startsAt: "",
    endsAt: "",
  });
  
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
      setRecentBookings([]);
      setRecentBookingCount(0);
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
          setRecentBookings(result.recentBookings);
          setRecentBookingCount(result.recentBookingCount);
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
    if (!admin || !["dashboard", "addHall", "halls"].includes(adminPage)) {
      return undefined;
    }

    let active = true;
    apiRequest(
      ["dashboard", "halls"].includes(adminPage)
        ? "/api/admin/halls"
        : "/api/halls",
    )
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

  async function setHallActive(hall) {
    const isActive = !hall.isActive;
    if (
      !isActive &&
      !window.confirm(t("Deactivating this hall hides it from new booking requests. Existing bookings are kept. Continue?"))
    ) {
      return;
    }

    setHallSubmitting(true);
    setHallError("");
    setHallMessage("");
    try {
      const result = await apiRequest(`/api/admin/halls/${hall.id}/status`, {
        method: "PATCH",
        body: { isActive },
      });
      setHalls((current) =>
        current.map((item) => item.id === hall.id ? result.hall : item),
      );
      setHallMessage(isActive ? "Hall activated successfully." : "Hall deactivated. Existing bookings are kept.");
    } catch (requestError) {
      setHallError(getErrorMessage(requestError));
    } finally {
      setHallSubmitting(false);
    }
  }

  function startEditingHall(hall) {
    setEditingHallId(hall.id);
    setEditHallForm({
      name: hall.name,
      capacity: String(hall.capacity),
      description: hall.description,
      facilities: [...hall.facilities],
      otherFacility: "",
    });
    setHallError("");
    setHallMessage("");
  }

  function updateEditHallField(event) {
    const { name, value } = event.target;
    setEditHallForm((current) => ({ ...current, [name]: value }));
  }

  function updateEditHallFacility(event) {
    const { checked, value } = event.target;
    setEditHallForm((current) => ({
      ...current,
      facilities: checked
        ? [...current.facilities, value]
        : current.facilities.filter((facility) => facility !== value),
    }));
  }

  async function saveHallDetails(event) {
    event.preventDefault();
    setHallSubmitting(true);
    setHallError("");
    setHallMessage("");
    try {
      const result = await apiRequest(`/api/admin/halls/${editingHallId}`, {
        method: "PATCH",
        body: {
          ...editHallForm,
          capacity: Number(editHallForm.capacity),
          facilities: [...new Set([
            ...editHallForm.facilities,
            ...(editHallForm.otherFacility.trim()
              ? [editHallForm.otherFacility.trim()]
              : []),
          ])],
        },
      });
      setHalls((current) =>
        current.map((item) => item.id === editingHallId ? result.hall : item),
      );
      setEditingHallId("");
      setEditHallForm(null);
      setHallMessage("Hall details updated successfully.");
    } catch (requestError) {
      setHallError(getErrorMessage(requestError));
    } finally {
      setHallSubmitting(false);
    }
  }

  async function setHallMaintenance(hall) {
    const bookingsPaused = !hall.bookingsPaused;
    if (
      bookingsPaused &&
      !window.confirm(t("Pausing bookings hides this hall from new booking requests. Existing bookings are kept. Continue?"))
    ) {
      return;
    }

    setHallSubmitting(true);
    setHallError("");
    setHallMessage("");
    try {
      const result = await apiRequest(`/api/admin/halls/${hall.id}/maintenance`, {
        method: "PATCH",
        body: { bookingsPaused },
      });
      setHalls((current) =>
        current.map((item) => item.id === hall.id ? result.hall : item),
      );
      setHallMessage(
        bookingsPaused
          ? "New bookings paused for maintenance."
          : "New bookings resumed for this hall.",
      );
    } catch (requestError) {
      setHallError(getErrorMessage(requestError));
    } finally {
      setHallSubmitting(false);
    }
  }

  function updateMaintenanceWindowField(event) {
    const { name, value } = event.target;
    setMaintenanceWindowForm((current) => ({ ...current, [name]: value }));
  }

  async function scheduleMaintenance(event, hallId) {
    event.preventDefault();
    setHallSubmitting(true);
    setHallError("");
    setHallMessage("");
    const path = `/api/admin/halls/${hallId}/maintenance-windows`;
    const body = { ...maintenanceWindowForm };
    try {
      let result;
      try {
        result = await apiRequest(path, { method: "POST", body });
      } catch (requestError) {
        if (requestError.message !== "MAINTENANCE_BOOKING_CONFLICT") {
          throw requestError;
        }
        const conflicts = requestError.details?.bookings ?? [];
        const conflictSummary = conflicts
          .map(({ date, startTime, endTime, meetingTitle }) =>
            `${date} ${startTime}-${endTime}: ${meetingTitle}`)
          .join("\n");
        if (!window.confirm(
          `${t("Existing bookings overlap this maintenance period:")} ${conflicts.length}\n${conflictSummary}\n\n${t("Schedule maintenance anyway?")}`,
        )) {
          return;
        }
        result = await apiRequest(path, {
          method: "POST",
          body: { ...body, allowBookingConflicts: true },
        });
      }

      setHalls((current) =>
        current.map((hall) => hall.id === hallId
          ? {
              ...hall,
              maintenanceWindows: [
                ...(hall.maintenanceWindows ?? []),
                result.window,
              ].sort((first, second) =>
                first.startsAt.localeCompare(second.startsAt)),
            }
          : hall),
      );
      setMaintenanceSchedulingHallId("");
      setMaintenanceWindowForm({ startsAt: "", endsAt: "" });
      setHallMessage(
        result.conflicts?.length
          ? "Maintenance scheduled. Review the overlapping bookings and contact the requesters."
          : "Maintenance scheduled successfully.",
      );
    } catch (requestError) {
      setHallError(getErrorMessage(requestError));
    } finally {
      setHallSubmitting(false);
    }
  }

  async function cancelMaintenanceWindow(hallId, windowId) {
    if (!window.confirm(t("Cancel this scheduled maintenance?"))) return;
    setHallSubmitting(true);
    setHallError("");
    setHallMessage("");
    try {
      await apiRequest(
        `/api/admin/halls/${hallId}/maintenance-windows/${windowId}`,
        { method: "DELETE" },
      );
      setHalls((current) =>
        current.map((hall) => hall.id === hallId
          ? {
              ...hall,
              maintenanceWindows: (hall.maintenanceWindows ?? [])
                .filter((window) => window.id !== windowId),
            }
          : hall),
      );
      setHallMessage("Scheduled maintenance cancelled.");
    } catch (requestError) {
      setHallError(getErrorMessage(requestError));
    } finally {
      setHallSubmitting(false);
    }
  }

  function formatMaintenanceDateTime(value) {
    return new Intl.DateTimeFormat(language === "si" ? "si-LK" : "en-LK", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Colombo",
    }).format(new Date(value));
  }

  function openRecentBooking(booking) {
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
          {admin && adminPage === "dashboard" && (
            <div className="notification-menu">
              <button
                className="notification-button"
                type="button"
                aria-label={`${t("Notifications")}${recentBookingCount ? `, ${recentBookingCount} ${t("New bookings in the last 24 hours")}` : ""}`}
                aria-expanded={notificationsOpen}
                aria-controls="admin-notifications"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M10 21h4" />
                </svg>
                {recentBookingCount > 0 && (
                  <span className="notification-badge" aria-hidden="true">
                    {recentBookingCount > 99 ? "99+" : recentBookingCount}
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
                      <p>{t("New bookings in the last 24 hours")}</p>
                    </div>
                    <span className="notification-total">{recentBookingCount}</span>
                  </div>
                  {notificationError ? (
                    <p className="notification-state" role="alert">{t(notificationError)}</p>
                  ) : recentBookings.length === 0 ? (
                    <p className="notification-state">{t("No new bookings in the last 24 hours.")}</p>
                  ) : (
                    <ul className="notification-list">
                      {recentBookings.map((booking) => (
                        <li key={booking.id}>
                          <button
                            className="notification-item"
                            type="button"
                            onClick={() => openRecentBooking(booking)}
                          >
                            <span className="notification-item-indicator" aria-hidden="true" />
                            <span className="notification-item-content">
                              <strong>{booking.meetingTitle}</strong>
                              {booking.contactDesignation && (
                                <span>{booking.contactDesignation}</span>
                              )}
                              <span>{booking.hallName}</span>
                              <small>{t(booking.status)}</small>
                              <small>
                                {formatNotificationDate(booking.date)} · {booking.startTime}–{booking.endTime}
                              </small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {recentBookingCount > recentBookings.length && (
                    <p className="notification-more">
                      {t("Showing the 10 most recent bookings. Review the calendar for all bookings.")}
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
          <h1>
            {adminPage === "reports"
              ? t("Monthly meeting report")
              : adminPage === "addHall"
                ? t("Add a conference hall")
                : adminPage === "halls"
                  ? t("Manage halls")
                  : adminPage === "password"
                    ? t("Change password")
                    : t("Dashboard")}
          </h1>
          <p>
            {adminPage === "reports"
              ? t("Review daily meeting and booking request counts for a selected month.")
              : adminPage === "addHall"
                ? t("Add hall details and select the facilities available in the room.")
                : adminPage === "halls"
                  ? t("Review active and inactive halls. You can activate a hall or stop new bookings without removing existing booking records.")
                  : adminPage === "password"
                    ? t("Update your administrator password to keep your account secure.")
                    : admin
                      ? t("Review bookings and manage the conference hall schedule.")
                      : t("Administrator accounts are provisioned by an authorized operator. Public registration is not available.")}
          </p>
        </section>

        <div className={`admin-workspace${admin ? "" : " unauthenticated"}`}>
          {admin && (
            <nav className="admin-navigation" aria-label={t("Administrator navigation")}>
              {[
                ["/admin", "Dashboard", "dashboard"],
                ["/admin/halls/new", "Add hall", "addHall"],
                ["/admin/reports", "Reports", "reports"],
                ["/admin/halls", "Manage halls", "halls"],
                ["/admin/password", "Change password", "password"],
              ].map(([href, label, page]) => (
                <a
                  className={`admin-navigation-link${adminPage === page ? " active" : ""}`}
                  href={href}
                  aria-current={adminPage === page ? "page" : undefined}
                  key={page}
                >
                  {t(label)}
                </a>
              ))}
            </nav>
          )}

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

                {adminPage === "reports" ? (
                  <AdminMonthlyReport />
                ) : adminPage === "dashboard" ? (
                  <>
                    <p className="notice">
                      {emailDeliveryConfigured
                        ? t("New bookings are confirmed automatically. Review the calendar to cancel a booking when necessary.")
                        : t("New bookings are confirmed automatically. Email notifications are not configured, so requesters will not receive confirmation emails.")}
                    </p>
                    <LiveCalendar
                      view="admin"
                      halls={halls}
                      selectedHallId={calendarHallId}
                      onHallChange={setCalendarHallId}
                      selectedDate={calendarSelectedDate || undefined}
                      onDateChange={setCalendarSelectedDate}
                    />
                  </>
                ) : adminPage === "addHall" ? (
                  <section className="hall-management" aria-labelledby="hall-management-heading">
                    <div className="panel-heading">
                      <div>
                        <p className="eyebrow">{t("Facilities")}</p>
                        <h2 id="hall-management-heading">{t("Add a conference hall")}</h2>
                        <p>{t("New halls become active on the public booking form.")}</p>
                      </div>
                    </div>
                    <form className="hall-form-grid" onSubmit={addHall}>
                      <div className="hall-details-fields">
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
                            rows={5}
                          />
                        </label>
                      </div>
                      <fieldset className="facility-picker hall-facility-picker">
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
                  </section>
                ) : adminPage === "halls" ? (
                  <section className="hall-list active-hall-list" aria-labelledby="active-halls-heading">
                    <h2 id="active-halls-heading">{t("Manage halls")}</h2>
                    <p className="hall-management-note">
                      {t("Deactivate a hall to stop new bookings. Existing bookings and records are kept; you can activate it again at any time.")}
                    </p>
                    <div className="hall-status-summary" aria-live="polite">
                      <span>{t("Active")}: {halls.filter((hall) => hall.isActive).length}</span>
                      <span>{t("Inactive")}: {halls.filter((hall) => !hall.isActive).length}</span>
                      <span>{t("Maintenance")}: {halls.filter((hall) => hall.bookingsPaused).length}</span>
                    </div>
                    {hallError && <p className="notice error" role="alert">{t(hallError)}</p>}
                    {hallMessage && <p className="notice success" role="status">{t(hallMessage)}</p>}
                    {halls.length === 0 ? (
                      <p>{t("No halls have been added yet.")}</p>
                    ) : (
                      <ul>
                        {halls.map((hall) => (
                          <li key={hall.id}>
                            <div className="hall-list-row">
                              <div className="hall-list-details">
                                <strong>{hall.name}</strong>
                                <span className={`hall-status${hall.isActive ? " active" : " inactive"}`}>
                                  {t(hall.isActive ? "Active" : "Inactive")}
                                </span>
                                {hall.bookingsPaused && (
                                  <span className="hall-status maintenance">{t("Maintenance")}</span>
                                )}
                                <span>{t("Capacity")} {hall.capacity}</span>
                                {hall.description && <span>{hall.description}</span>}
                                {hall.facilities.length > 0 && (
                                  <span>{hall.facilities.join(", ")}</span>
                                )}
                                {(hall.maintenanceWindows ?? []).length > 0 && (
                                  <div className="hall-scheduled-maintenance">
                                    <strong>{t("Scheduled maintenance")}</strong>
                                    <ul>
                                      {hall.maintenanceWindows.map((window) => (
                                        <li key={window.id}>
                                          <span>
                                            {formatMaintenanceDateTime(window.startsAt)}
                                            {" – "}
                                            {formatMaintenanceDateTime(window.endsAt)}
                                          </span>
                                          <button
                                            className="quiet-link"
                                            type="button"
                                            onClick={() => cancelMaintenanceWindow(hall.id, window.id)}
                                            disabled={hallSubmitting}
                                          >
                                            {t("Cancel schedule")}
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                              <div className="hall-actions">
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() => startEditingHall(hall)}
                                  disabled={hallSubmitting}
                                >
                                  {t("Edit details")}
                                </button>
                                <button
                                  className={hall.bookingsPaused ? "primary-button" : "secondary-button"}
                                  type="button"
                                  onClick={() => setHallMaintenance(hall)}
                                  disabled={hallSubmitting}
                                >
                                  {t(hall.bookingsPaused ? "Resume bookings" : "Pause for maintenance")}
                                </button>
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() => {
                                    setMaintenanceSchedulingHallId(
                                      maintenanceSchedulingHallId === hall.id ? "" : hall.id,
                                    );
                                    setMaintenanceWindowForm({ startsAt: "", endsAt: "" });
                                  }}
                                  disabled={hallSubmitting}
                                >
                                  {t("Schedule maintenance")}
                                </button>
                                <button
                                  className={hall.isActive ? "cancel-button" : "primary-button"}
                                  type="button"
                                  onClick={() => setHallActive(hall)}
                                  disabled={hallSubmitting}
                                >
                                  {t(hall.isActive ? "Deactivate" : "Activate")}
                                </button>
                              </div>
                            </div>
                            {maintenanceSchedulingHallId === hall.id && (
                              <form
                                className="hall-edit-form maintenance-window-form"
                                onSubmit={(event) => scheduleMaintenance(event, hall.id)}
                              >
                                <h3>{t("Schedule maintenance")}</h3>
                                <p>
                                  {t("New bookings will be blocked only during this scheduled period.")}
                                  {" "}{t("All maintenance times use Sri Lanka time.")}
                                </p>
                                <div className="hall-form-grid">
                                  <label className="field" htmlFor={`maintenance-start-${hall.id}`}>
                                    <span>{t("Starts")}</span>
                                    <input
                                      id={`maintenance-start-${hall.id}`}
                                      name="startsAt"
                                      type="datetime-local"
                                      step="900"
                                      value={maintenanceWindowForm.startsAt}
                                      onChange={updateMaintenanceWindowField}
                                      required
                                      disabled={hallSubmitting}
                                    />
                                  </label>
                                  <label className="field" htmlFor={`maintenance-end-${hall.id}`}>
                                    <span>{t("Ends")}</span>
                                    <input
                                      id={`maintenance-end-${hall.id}`}
                                      name="endsAt"
                                      type="datetime-local"
                                      step="900"
                                      value={maintenanceWindowForm.endsAt}
                                      onChange={updateMaintenanceWindowField}
                                      required
                                      disabled={hallSubmitting}
                                    />
                                  </label>
                                </div>
                                <div className="form-actions">
                                  <button className="primary-button" type="submit" disabled={hallSubmitting}>
                                    {hallSubmitting ? t("Saving…") : t("Save schedule")}
                                  </button>
                                  <button
                                    className="secondary-button"
                                    type="button"
                                    onClick={() => setMaintenanceSchedulingHallId("")}
                                    disabled={hallSubmitting}
                                  >
                                    {t("Cancel")}
                                  </button>
                                </div>
                              </form>
                            )}
                            {editingHallId === hall.id && editHallForm && (
                              <form className="hall-edit-form" onSubmit={saveHallDetails}>
                                <h3>{t("Edit hall details")}</h3>
                                <div className="hall-form-grid">
                                  <label className="field" htmlFor={`edit-hall-name-${hall.id}`}>
                                    <span>{t("Hall name")}</span>
                                    <input
                                      id={`edit-hall-name-${hall.id}`}
                                      name="name"
                                      value={editHallForm.name}
                                      onChange={updateEditHallField}
                                      minLength={2}
                                      maxLength={120}
                                      required
                                      disabled={hallSubmitting}
                                    />
                                  </label>
                                  <label className="field" htmlFor={`edit-hall-capacity-${hall.id}`}>
                                    <span>{t("Capacity")}</span>
                                    <input
                                      id={`edit-hall-capacity-${hall.id}`}
                                      name="capacity"
                                      type="number"
                                      value={editHallForm.capacity}
                                      onChange={updateEditHallField}
                                      min="1"
                                      max="10000"
                                      required
                                      disabled={hallSubmitting}
                                    />
                                  </label>
                                  <label className="field" htmlFor={`edit-hall-description-${hall.id}`}>
                                    <span>{t("Description")}</span>
                                    <textarea
                                      id={`edit-hall-description-${hall.id}`}
                                      name="description"
                                      value={editHallForm.description}
                                      onChange={updateEditHallField}
                                      maxLength={2000}
                                      rows={3}
                                      disabled={hallSubmitting}
                                    />
                                  </label>
                                  <fieldset className="facility-picker hall-facility-picker">
                                    <legend>{t("Facilities")}</legend>
                                    <div className="facility-options">
                                      {[...new Set([
                                        ...COMMON_FACILITIES,
                                        ...hall.facilities,
                                      ])].map((facility) => (
                                        <label className="facility-option" key={facility}>
                                          <input
                                            type="checkbox"
                                            value={facility}
                                            checked={editHallForm.facilities.includes(facility)}
                                            onChange={updateEditHallFacility}
                                            disabled={hallSubmitting}
                                          />
                                          <span>{t(facility)}</span>
                                        </label>
                                      ))}
                                    </div>
                                    <label className="field other-facility-field">
                                      <span>{t("Other facility")}</span>
                                      <input
                                        name="otherFacility"
                                        value={editHallForm.otherFacility}
                                        onChange={updateEditHallField}
                                        maxLength={80}
                                        disabled={hallSubmitting}
                                      />
                                    </label>
                                  </fieldset>
                                </div>
                                <div className="form-actions">
                                  <button className="primary-button" type="submit" disabled={hallSubmitting}>
                                    {hallSubmitting ? t("Saving…") : t("Save hall details")}
                                  </button>
                                  <button
                                    className="secondary-button"
                                    type="button"
                                    onClick={() => {
                                      setEditingHallId("");
                                      setEditHallForm(null);
                                    }}
                                    disabled={hallSubmitting}
                                  >
                                    {t("Cancel")}
                                  </button>
                                </div>
                              </form>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ) : (
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
                )}
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
                    maxLength={254}
                    pattern="[A-Za-z0-9][A-Za-z0-9._@\\-]*"
                    title={t("Enter your admin username or email address.")}
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
        </div>
      </main>
      <footer className="site-footer">{t("Authorized administrators only.")}</footer>
    </div>
  );
}
