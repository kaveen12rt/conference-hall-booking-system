import { useEffect, useState } from "react";
import LiveCalendar from "../components/LiveCalendar.jsx";
import { apiRequest, getErrorMessage } from "../services/api.js";
import { SitePreferences, usePreferences } from "../context/PreferencesContext.jsx";

const initialForm = {
  hallId: "",
  meetingTitle: "",
  bookingDate: "",
  startTime: "",
  endTime: "",
  participantCount: "",
  contactName: "",
  contactDesignation: "",
  contactEmail: "",
  contactPhone: "",
  additionalRequirements: "",
  website: "",
};

function PageHeader() {
  const { t } = usePreferences();

  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label={t("Conference Hall Booking")}>
        <img
          className="brand-emblem"
          src="/sri-lanka-state-emblem.svg"
          alt=""
          aria-hidden="true"
        />
        <span>
          <strong>{t("Conference Hall Booking")}</strong>
          <small>{t("Ministry of Digital Economy")}</small>
        </span>
      </a>
      <div className="header-actions">
        <SitePreferences />
        <a className="quiet-link" href="/admin">{t("Administrator")}</a>
      </div>
    </header>
  );
}

function addQuarterHour(time) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + 15;
  if (totalMinutes > 23 * 60 + 45) return "";
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(
    totalMinutes % 60,
  ).padStart(2, "0")}`;
}

function isQuarterHour(time) {
  return /^\d{2}:(?:00|15|30|45)$/.test(time);
}

function sriLankaBookingInstant(date, time) {
  return Date.parse(`${date}T${time}:00+05:30`);
}

function getSriLankaDateTime(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Colombo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function nextQuarterHour(time) {
  if (!time) return "00:00";
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = Math.ceil((hours * 60 + minutes + 1) / 15) * 15;
  if (totalMinutes > 23 * 60 + 45) return "24:00";
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(
    totalMinutes % 60,
  ).padStart(2, "0")}`;
}

const QUARTER_HOUR_TIMES = Array.from({ length: 96 }, (_, index) => {
  const minutes = index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
});

function Field({ label, name, value, onChange, required = false, ...props }) {
  const id = `booking-${name}`;
  const { multiline, className = "", ...inputProps } = props;
  const isTextArea = multiline;
  const control = isTextArea ? (
    <textarea
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      required={required}
      {...inputProps}
    />
  ) : (
    <input
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      required={required}
      {...inputProps}
    />
  );

  return (
    <label className={`field ${className}`} htmlFor={id}>
      <span>{label}{required && <span aria-hidden="true"> *</span>}</span>
      {control}
    </label>
  );
}

export default function BookingPage() {
  const { language, t } = usePreferences();
  const initialManageToken = new URLSearchParams(window.location.hash.slice(1)).get("manage");
  const [halls, setHalls] = useState([]);
  const [hallsLoading, setHallsLoading] = useState(true);
  const [hallError, setHallError] = useState("");
  const [form, setForm] = useState(initialForm);
  const selectedHall = halls.find((hall) => hall.id === form.hallId);
  const [availability, setAvailability] = useState({
    hallId: "",
    month: "",
    loaded: false,
    slots: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [submitError, setSubmitError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [manageToken] = useState(initialManageToken ?? "");
  const [managementLoading, setManagementLoading] = useState(Boolean(initialManageToken));
  const [managementError, setManagementError] = useState("");
  const [managementMessage, setManagementMessage] = useState("");
  const [bookingStatus, setBookingStatus] = useState("");
  const [managementCanEdit, setManagementCanEdit] = useState(false);
  const [managementCanCancel, setManagementCanCancel] = useState(false);
  const [managedBookingOriginal, setManagedBookingOriginal] = useState(null);
  const sriLankaNow = getSriLankaDateTime(currentTime);
  const minimumStartTime = form.bookingDate === sriLankaNow.date
    ? nextQuarterHour(sriLankaNow.time)
    : "00:00";
  const startTimeOptions = QUARTER_HOUR_TIMES.filter(
    (time) => time >= minimumStartTime && time <= "23:30",
  );
  const minimumEndTime = form.startTime
    ? addQuarterHour(form.startTime)
    : minimumStartTime;
  const endTimeOptions = QUARTER_HOUR_TIMES.filter(
    (time) => time >= minimumEndTime && time <= "23:45",
  );
  const bookingDateIsPast = Boolean(form.bookingDate && form.bookingDate < sriLankaNow.date);
  const bookingStartIsPast = Boolean(
    form.bookingDate === sriLankaNow.date &&
      form.startTime &&
      form.startTime <= sriLankaNow.time,
  );

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!initialManageToken) return undefined;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    let active = true;
    apiRequest("/api/bookings/manage", {
      method: "POST",
      body: { manageToken: initialManageToken },
    })
      .then(({ booking, canEdit, canCancel }) => {
        if (!active) return;
        setForm({
          ...initialForm,
          hallId: booking.hallId,
          meetingTitle: booking.meetingTitle,
          bookingDate: booking.bookingDate,
          startTime: booking.startTime,
          endTime: booking.endTime,
          participantCount: String(booking.participantCount),
          contactName: booking.contactName,
          contactDesignation: booking.contactDesignation ?? "",
          contactEmail: booking.contactEmail,
          contactPhone: booking.contactPhone,
          additionalRequirements: booking.additionalRequirements,
        });
        setManagedBookingOriginal(booking);
        setBookingStatus(booking.status);
        setManagementCanEdit(canEdit);
        setManagementCanCancel(canCancel);
      })
      .catch((error) => {
        if (active) setManagementError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setManagementLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialManageToken]);

  useEffect(() => {
    let active = true;
    apiRequest("/api/halls")
      .then((result) => {
        if (active) setHalls(result.halls);
      })
      .catch((error) => {
        if (active) setHallError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setHallsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function updateField(event) {
    const { name, value } = event.target;
    if (name === "bookingDate") {
      setForm((current) => ({
        ...current,
        bookingDate: value,
        startTime: "",
        endTime: "",
      }));
      return;
    }
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateStartTime(event) {
    const startTime = event.target.value;
    setForm((current) => ({
      ...current,
      startTime,
      endTime:
        startTime && (!current.endTime || current.endTime <= startTime)
          ? addQuarterHour(startTime)
          : current.endTime,
    }));
  }

  const bookingDateMonth = form.bookingDate.slice(0, 7);
  const availabilityIsCurrent =
    availability.loaded &&
    availability.hallId === form.hallId &&
    availability.month === bookingDateMonth;
  const invalidTimeIncrement = Boolean(
    (form.startTime && !isQuarterHour(form.startTime)) ||
      (form.endTime && !isQuarterHour(form.endTime)),
  );
  const invalidBookingDateOrTime = bookingDateIsPast || bookingStartIsPast;
  const invalidTimeRange = Boolean(
    form.startTime &&
      form.endTime &&
      isQuarterHour(form.startTime) &&
      isQuarterHour(form.endTime) &&
      form.endTime <= form.startTime,
  );
  const overlappingSlot = availabilityIsCurrent
    ? availability.slots.find(
        (slot) =>
          slot.status !== "completed" &&
          slot.date === form.bookingDate &&
          form.hallId &&
          form.startTime &&
          form.endTime &&
          form.startTime < slot.endTime &&
          form.endTime > slot.startTime &&
          !(
            manageToken &&
            managedBookingOriginal &&
            form.hallId === managedBookingOriginal.hallId &&
            form.bookingDate === managedBookingOriginal.bookingDate &&
            slot.date === managedBookingOriginal.bookingDate &&
            slot.startTime === managedBookingOriginal.startTime &&
            slot.endTime === managedBookingOriginal.endTime
          ),
      )
    : null;
  const maintenanceConflict =
    selectedHall &&
    form.bookingDate &&
    form.startTime &&
    form.endTime
      ? (selectedHall.maintenanceWindows ?? []).find((window) => {
          const bookingStart = sriLankaBookingInstant(form.bookingDate, form.startTime);
          const bookingEnd = sriLankaBookingInstant(form.bookingDate, form.endTime);
          return (
            bookingStart < Date.parse(window.endsAt) &&
            bookingEnd > Date.parse(window.startsAt)
          );
        })
      : null;
  const selectedTimeIsAvailable =
    Boolean(
      availabilityIsCurrent &&
        form.hallId &&
        form.startTime &&
        isQuarterHour(form.startTime) &&
        isQuarterHour(form.endTime) &&
        form.endTime > form.startTime &&
        !overlappingSlot &&
        !maintenanceConflict,
    );

  async function submitBooking(event) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    setReceipt("");

    try {
      const result = await apiRequest(
        manageToken ? "/api/bookings/manage" : "/api/bookings",
        {
        method: manageToken ? "PATCH" : "POST",
        body: {
          ...(manageToken ? { manageToken } : {}),
          ...form,
          participantCount: Number(form.participantCount),
        },
      });
      if (manageToken) {
        setBookingStatus(result.status);
        setManagedBookingOriginal((current) => ({
          ...current,
          ...form,
          participantCount: Number(form.participantCount),
          status: result.status,
        }));
        setManagementMessage(
          !result.changed
            ? t("No changes were made.")
            : t("Your booking was updated and remains confirmed."),
        );
        setManagementCanEdit(result.status === "pending" || result.status === "approved");
        setManagementCanCancel(result.status === "pending" || result.status === "approved");
      } else {
        setReceipt(result.emailStatus);
        setForm(initialForm);
      }
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelBooking() {
    if (!window.confirm(t("Are you sure you want to cancel this booking?"))) return;
    setSubmitting(true);
    setSubmitError("");
    setManagementMessage("");
    try {
      await apiRequest("/api/bookings/manage/cancel", {
        method: "POST",
        body: { manageToken },
      });
      setBookingStatus("cancelled");
      setManagementCanEdit(false);
      setManagementCanCancel(false);
      setManagementMessage(t("Your booking has been cancelled."));
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const managementReady =
    !initialManageToken || (!managementLoading && !managementError);
  const formIsEditable = !manageToken || managementCanEdit;

  return (
    <div className="app-shell">
      <PageHeader />
      <main className="content">
        <section className="intro-block">
          <div className="intro-copy">
            <p className="eyebrow">{t("Ministry of Digital Economy · Sri Lanka")}</p>
            <h1>{t("Conference hall reservations")}</h1>
            <p>
              {t("Check availability and book a conference hall online. Your booking is confirmed immediately.")}
            </p>
          </div>
          <div className="intro-aside" aria-label={t("Online service information")}>
            <span className="service-indicator" aria-hidden="true" />
            <span><strong>{t("Public access")}</strong><small>{t("No account required")}</small></span>
          </div>
        </section>

        <div className="booking-layout">
          <section className="panel booking-panel" aria-labelledby="booking-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{t("Reservation details")}</p>
                <h2 id="booking-heading">
                  {manageToken ? t("Manage your booking") : t("Book a conference hall")}
                </h2>
                <p>
                  {manageToken
                    ? t("Update your request or cancel it. Contact details cannot be changed here.")
                    : t("Complete the required fields. The booking is confirmed as soon as it is submitted.")}
                </p>
              </div>
            </div>

            {managementLoading && <p role="status">{t("Loading your booking…")}</p>}
            {managementError && (
              <p className="notice error" role="alert">{t(managementError)}</p>
            )}
            {manageToken && !managementLoading && !managementError && (
              <>
                <p className="notice" role="status">
                  {t("Booking status")}: {t(bookingStatus)}
                </p>
                {bookingStatus === "approved" && !managementCanEdit && (
                  <p className="notice" role="note">
                    {t("Your approved booking can only be edited or cancelled more than one hour before it starts.")}
                  </p>
                )}
                {bookingStatus === "pending" && !managementCanCancel && (
                  <p className="notice" role="note">
                    {t("Bookings can only be cancelled more than one hour before they start.")}
                  </p>
                )}
                {!["pending", "approved"].includes(bookingStatus) && (
                  <p className="notice" role="note">
                    {t("This booking can no longer be edited or cancelled.")}
                  </p>
                )}
              </>
            )}
            {hallsLoading && <p role="status">{t("Loading available halls…")}</p>}
            {hallError && (
              <div className="notice error" role="alert">
                <strong>{t("Halls could not be loaded")}</strong>
                <span>{t(hallError)}</span>
                <span>{t("Please try again later or contact the service administrator.")}</span>
              </div>
            )}
            {!hallsLoading && !hallError && halls.length === 0 && (
              <p className="notice">
                {t("No halls are currently available to request. Please check again later.")}
              </p>
            )}

            {managementReady && !hallsLoading && halls.length > 0 && (
              <form className="form-grid" onSubmit={submitBooking}>
              <label className="field full-width" htmlFor="booking-hallId">
                <span>{t("Conference hall")} <span aria-hidden="true">*</span></span>
                <select
                  id="booking-hallId"
                  name="hallId"
                  value={form.hallId}
                  onChange={updateField}
                  disabled={!formIsEditable}
                  required
                >
                  <option value="">{t("Select a hall")}</option>
                  {form.hallId && !halls.some((hall) => hall.id === form.hallId) && (
                    <option value={form.hallId}>{t("Previously selected hall")}</option>
                  )}
                  {halls.map((hall) => (
                    <option key={hall.id} value={hall.id}>
                      {hall.name} — {t("Capacity").toLowerCase()} {hall.capacity}
                    </option>
                  ))}
                </select>
              </label>

              {selectedHall && (
                <section
                  className="selected-hall-details full-width"
                  aria-label={t("Selected hall details")}
                  aria-live="polite"
                >
                  <div className="selected-hall-heading">
                    <h3>{selectedHall.name}</h3>
                    <span>{t("Capacity")}: {selectedHall.capacity}</span>
                  </div>
                  <p>
                    <strong>{t("Description")}:</strong>{" "}
                    {selectedHall.description || t("No description provided.")}
                  </p>
                  <div className="selected-hall-facilities">
                    <strong>{t("Facilities")}:</strong>
                    {selectedHall.facilities.length > 0 ? (
                      <ul>
                        {selectedHall.facilities.map((facility) => (
                          <li key={facility}>{t(facility)}</li>
                        ))}
                      </ul>
                    ) : (
                      <span>{t("No facilities listed.")}</span>
                    )}
                  </div>
                  {(selectedHall.maintenanceWindows ?? []).length > 0 && (
                    <div className="selected-hall-maintenance">
                      <strong>{t("Scheduled maintenance")}:</strong>
                      <ul>
                        {selectedHall.maintenanceWindows.map((window) => (
                          <li key={window.id}>
                            {new Intl.DateTimeFormat(
                              language === "si" ? "si-LK" : "en-LK",
                              {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: "Asia/Colombo",
                              },
                            ).format(new Date(window.startsAt))}
                            {" – "}
                            {new Intl.DateTimeFormat(
                              language === "si" ? "si-LK" : "en-LK",
                              {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: "Asia/Colombo",
                              },
                            ).format(new Date(window.endsAt))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              <Field
                label={t("Meeting title")}
                name="meetingTitle"
                value={form.meetingTitle}
                onChange={updateField}
                required
                disabled={!formIsEditable}
                maxLength={160}
              />
              <Field
                label={t("Expected participants")}
                name="participantCount"
                value={form.participantCount}
                onChange={updateField}
                required
                type="number"
                disabled={!formIsEditable}
                min="1"
                max={halls.find((hall) => hall.id === form.hallId)?.capacity}
              />
              <Field
                label={t("Date")}
                name="bookingDate"
                value={form.bookingDate}
                onChange={updateField}
                required
                disabled={!formIsEditable}
                type="date"
                min={sriLankaNow.date}
              />
              <div className="field-pair">
                <label className="field" htmlFor="booking-startTime">
                  <span>{t("Start time")} <span aria-hidden="true">*</span></span>
                  <select
                    id="booking-startTime"
                    name="startTime"
                    value={form.startTime}
                    onChange={updateStartTime}
                    required
                    disabled={!formIsEditable}
                  >
                    <option value="">{t("Select a start time")}</option>
                    {startTimeOptions.map((time) => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </label>
                <label className="field" htmlFor="booking-endTime">
                  <span>{t("End time")} <span aria-hidden="true">*</span></span>
                  <select
                    id="booking-endTime"
                    name="endTime"
                    value={form.endTime}
                    onChange={updateField}
                    required
                    disabled={!formIsEditable || !form.startTime}
                  >
                    <option value="">{t("Select an end time")}</option>
                    {endTimeOptions.map((time) => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p
                className={[
                  "time-availability",
                  "full-width",
                  overlappingSlot || invalidTimeIncrement || invalidTimeRange ||
                    invalidBookingDateOrTime
                    ? "unavailable"
                    : "",
                  selectedTimeIsAvailable ? "available" : "",
                ].filter(Boolean).join(" ")}
                aria-live="polite"
              >
                {bookingDateIsPast
                  ? t("Past dates cannot be booked. Choose today or a future date.")
                  : bookingStartIsPast
                    ? t("That start time has passed. Choose a future 15-minute time slot.")
                    : invalidTimeIncrement
                  ? t("Choose start and end times in 15-minute increments, such as 09:00 or 09:15.")
                  : invalidTimeRange
                    ? t("End time must be later than start time.")
                    : maintenanceConflict
                      ? t("This time is unavailable because the hall is scheduled for maintenance.")
                    : overlappingSlot
                  ? t("This time overlaps a reserved slot ({start}–{end}). Choose another time.", {
                    start: overlappingSlot.startTime,
                    end: overlappingSlot.endTime,
                  })
                  : selectedTimeIsAvailable
                    ? t("No reservation overlaps this time. The server checks again when you submit.")
                    : t("Only 15-minute time slots are available. Past times today and past dates cannot be selected.")}
              </p>
              <Field
                label={t("Contact name")}
                name="contactName"
                value={form.contactName}
                onChange={updateField}
                required
                disabled={Boolean(manageToken)}
                maxLength={160}
              />
              <Field
                label={t("Designation (optional)")}
                name="contactDesignation"
                value={form.contactDesignation}
                onChange={updateField}
                disabled={Boolean(manageToken)}
                maxLength={160}
              />
              <Field
                label={t("Contact email")}
                name="contactEmail"
                value={form.contactEmail}
                onChange={updateField}
                required
                disabled={Boolean(manageToken)}
                type="email"
                maxLength={254}
              />
              <Field
                label={t("Contact phone")}
                name="contactPhone"
                value={form.contactPhone}
                onChange={updateField}
                required
                disabled={Boolean(manageToken)}
                type="tel"
                minLength={6}
                maxLength={32}
              />
              <Field
                label={t("Additional requirements")}
                name="additionalRequirements"
                value={form.additionalRequirements}
                onChange={updateField}
                disabled={!formIsEditable}
                multiline
                rows={3}
                maxLength={2000}
                className="full-width"
              />

              <div className="honeypot" aria-hidden="true">
                <label htmlFor="booking-website">{t("Leave this field empty")}</label>
                <input
                  id="booking-website"
                  name="website"
                  value={form.website}
                  onChange={updateField}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {submitError && (
                <p className="notice error full-width" role="alert">{t(submitError)}</p>
              )}
              {managementMessage && (
                <p className="notice success full-width" role="status">
                  {managementMessage}
                </p>
              )}
              {receipt && (
                <div className="notice success full-width" role="status">
                  <strong>{t("Booking confirmed.")}</strong>
                  <span>{t("Your booking is confirmed and now visible on the public schedule. Personal details remain private.")}</span>
                  <span>
                    {receipt === "queued"
                      ? t("A confirmation email with your secure edit and cancellation link has been queued.")
                      : t("Email delivery is not configured yet. Contact the administrator for updates.")}
                  </span>
                </div>
              )}
              <div className="form-actions full-width">
                {formIsEditable && (
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={
                      submitting ||
                      invalidBookingDateOrTime ||
                      invalidTimeIncrement ||
                      invalidTimeRange ||
                      Boolean(maintenanceConflict)
                    }
                  >
                    {submitting
                      ? t("Submitting…")
                      : manageToken
                        ? t("Save booking changes")
                        : t("Confirm booking")}
                  </button>
                )}
                {manageToken && managementCanCancel && (
                  <button
                    className="cancel-button"
                    type="button"
                    onClick={cancelBooking}
                    disabled={submitting}
                  >
                    {t("Cancel my booking")}
                  </button>
                )}
              </div>
              </form>
            )}
          </section>

          <LiveCalendar
            view="public"
            halls={halls}
            selectedHallId={form.hallId}
            selectedDate={form.bookingDate}
            onDateChange={(bookingDate) => setForm((current) => ({
              ...current,
              bookingDate,
              startTime: "",
              endTime: "",
            }))}
            onHallChange={(hallId) => setForm((current) => ({ ...current, hallId }))}
            onAvailabilityChange={setAvailability}
          />
        </div>

      </main>
      <footer className="site-footer">
        {t("The public schedule shows reserved dates, times and halls only. Meeting and contact details are private.")}
      </footer>
    </div>
  );
}
