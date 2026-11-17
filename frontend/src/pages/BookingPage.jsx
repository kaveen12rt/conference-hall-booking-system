import { useEffect, useState } from "react";
import LiveCalendar from "../components/LiveCalendar.jsx";
import { apiRequest, getErrorMessage } from "../services/api.js";
import { SitePreferences, usePreferences } from "../context/PreferencesContext.jsx";

const initialForm = {
  hallId: "",
  meetingTitle: "",
  purpose: "",
  bookingDate: "",
  startTime: "",
  endTime: "",
  participantCount: "",
  contactName: "",
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
  const { t } = usePreferences();
  const [halls, setHalls] = useState([]);
  const [hallsLoading, setHallsLoading] = useState(true);
  const [hallError, setHallError] = useState("");
  const [form, setForm] = useState(initialForm);
  const [availability, setAvailability] = useState({
    hallId: "",
    month: "",
    loaded: false,
    slots: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [receipt, setReceipt] = useState("");

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
          slot.date === form.bookingDate &&
          form.hallId &&
          form.startTime &&
          form.endTime &&
          form.startTime < slot.endTime &&
          form.endTime > slot.startTime,
      )
    : null;
  const selectedTimeIsAvailable =
    Boolean(
      availabilityIsCurrent &&
        form.hallId &&
        form.startTime &&
        isQuarterHour(form.startTime) &&
        isQuarterHour(form.endTime) &&
        form.endTime > form.startTime &&
        !overlappingSlot,
    );

  async function submitBooking(event) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    setReceipt("");

    try {
      const result = await apiRequest("/api/bookings", {
        method: "POST",
        body: {
          ...form,
          participantCount: Number(form.participantCount),
        },
      });
      setReceipt(result.emailStatus);
      setForm(initialForm);
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <PageHeader />
      <main className="content">
        <section className="intro-block">
          <div className="intro-copy">
            <p className="eyebrow">{t("Ministry of Digital Economy · Sri Lanka")}</p>
            <h1>{t("Conference hall reservations")}</h1>
            <p>
              {t("Check the public schedule and submit a reservation request online. No account is needed.")}
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
                <h2 id="booking-heading">{t("Submit a booking request")}</h2>
                <p>{t("Complete the required fields to send your request for review.")}</p>
              </div>
            </div>

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

            {!hallsLoading && halls.length > 0 && (
              <form className="form-grid" onSubmit={submitBooking}>
              <label className="field full-width" htmlFor="booking-hallId">
                <span>{t("Conference hall")} <span aria-hidden="true">*</span></span>
                <select
                  id="booking-hallId"
                  name="hallId"
                  value={form.hallId}
                  onChange={updateField}
                  required
                >
                  <option value="">{t("Select a hall")}</option>
                  {halls.map((hall) => (
                    <option key={hall.id} value={hall.id}>
                      {hall.name} — {t("Capacity").toLowerCase()} {hall.capacity}
                    </option>
                  ))}
                </select>
              </label>

              <Field
                label={t("Meeting title")}
                name="meetingTitle"
                value={form.meetingTitle}
                onChange={updateField}
                required
                maxLength={160}
              />
              <Field
                label={t("Expected participants")}
                name="participantCount"
                value={form.participantCount}
                onChange={updateField}
                required
                type="number"
                min="1"
                max={halls.find((hall) => hall.id === form.hallId)?.capacity}
              />
              <Field
                label={t("Date")}
                name="bookingDate"
                value={form.bookingDate}
                onChange={updateField}
                required
                type="date"
              />
              <div className="field-pair">
                <Field
                  label={t("Start time")}
                  name="startTime"
                  value={form.startTime}
                  onChange={updateStartTime}
                  required
                  type="time"
                  step="900"
                  max="23:30"
                />
                <Field
                  label={t("End time")}
                  name="endTime"
                  value={form.endTime}
                  onChange={updateField}
                  required
                  type="time"
                  step="900"
                  min={form.startTime ? addQuarterHour(form.startTime) : undefined}
                  max="23:45"
                />
              </div>
              <p
                className={[
                  "time-availability",
                  "full-width",
                  overlappingSlot || invalidTimeIncrement || invalidTimeRange
                    ? "unavailable"
                    : "",
                  selectedTimeIsAvailable ? "available" : "",
                ].filter(Boolean).join(" ")}
                aria-live="polite"
              >
                {invalidTimeIncrement
                  ? t("Choose start and end times in 15-minute increments, such as 09:00 or 09:15.")
                  : invalidTimeRange
                    ? t("End time must be later than start time.")
                    : overlappingSlot
                  ? t("This time overlaps a reserved slot ({start}–{end}). Choose another time.", {
                    start: overlappingSlot.startTime,
                    end: overlappingSlot.endTime,
                  })
                  : selectedTimeIsAvailable
                    ? t("No pending or approved reservation overlaps this time. The server checks again when you submit.")
                    : t("Times use 15-minute increments. Changing the start time moves the end forward when needed; choose a hall and date to check listed reservations.")}
              </p>
              <Field
                label={t("Purpose")}
                name="purpose"
                value={form.purpose}
                onChange={updateField}
                required
                multiline
                rows={3}
                maxLength={2000}
                className="full-width"
              />
              <Field
                label={t("Contact name")}
                name="contactName"
                value={form.contactName}
                onChange={updateField}
                required
                maxLength={160}
              />
              <Field
                label={t("Contact email")}
                name="contactEmail"
                value={form.contactEmail}
                onChange={updateField}
                required
                type="email"
                maxLength={254}
              />
              <Field
                label={t("Contact phone")}
                name="contactPhone"
                value={form.contactPhone}
                onChange={updateField}
                required
                type="tel"
                minLength={6}
                maxLength={32}
              />
              <Field
                label={t("Additional requirements")}
                name="additionalRequirements"
                value={form.additionalRequirements}
                onChange={updateField}
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
              {receipt && (
                <div className="notice success full-width" role="status">
                  <strong>{t("Request submitted.")}</strong>
                  <span>{t("Your request is now visible on the public schedule. Personal details remain private.")}</span>
                  <span>
                    {receipt === "queued"
                      ? t("A confirmation email has been queued.")
                      : t("Email delivery is not configured yet. Contact the administrator for updates.")}
                  </span>
                </div>
              )}
              <div className="form-actions full-width">
                <button className="primary-button" type="submit" disabled={submitting}>
                  {submitting ? t("Submitting…") : t("Submit booking request")}
                </button>
              </div>
              </form>
            )}
          </section>

          <LiveCalendar
            view="public"
            halls={halls}
            selectedHallId={form.hallId}
            selectedDate={form.bookingDate}
            onDateChange={(bookingDate) =>
              setForm((current) => ({ ...current, bookingDate }))
            }
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
