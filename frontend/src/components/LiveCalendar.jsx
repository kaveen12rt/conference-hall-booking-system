import { useEffect, useMemo, useState } from "react";
import { apiRequest, getErrorMessage } from "../services/api.js";
import { usePreferences } from "../context/PreferencesContext.jsx";

const TIME_ZONE = "Asia/Colombo";
const REFRESH_INTERVAL_MS = 30_000;
const NOOP = () => {};
const SINHALA_MONTHS = [
  "ජනවාරි", "පෙබරවාරි", "මාර්තු", "අප්‍රේල්", "මැයි", "ජූනි",
  "ජූලි", "අගෝස්තු", "සැප්තැම්බර්", "ඔක්තෝබර්", "නොවැම්බර්", "දෙසැම්බර්",
];
const SINHALA_WEEKDAYS = [
  "ඉරිදා", "සඳුදා", "අඟහරුවාදා", "බදාදා", "බ්‍රහස්පතින්දා", "සිකුරාදා", "සෙනසුරාදා",
];
const SINHALA_SHORT_WEEKDAYS = [
  "සඳු", "අඟ", "බදා", "බ්‍රහ", "සිකු", "සෙන", "ඉරි",
];

function dateInProjectZone(date = new Date()) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function getMonthDays(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstDayOffset = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;

  return [
    ...Array.from({ length: firstDayOffset }, () => null),
    ...Array.from({ length: dayCount }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return `${month}-${day}`;
    }),
  ];
}

function formatMonth(month, locale, language) {
  if (language === "si") {
    const [year, monthNumber] = month.split("-").map(Number);
    return `${SINHALA_MONTHS[monthNumber - 1]} ${year}`;
  }
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date(`${month}-15T12:00:00+05:30`));
}

function shiftMonth(month, amount) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatClock(date, locale, language) {
  if (language === "si") {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-LK", {
        timeZone: TIME_ZONE,
        weekday: "long",
        day: "numeric",
        month: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      })
        .formatToParts(date)
        .map(({ type, value }) => [type, value]),
    );
    const weekday = SINHALA_WEEKDAYS[
      ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        .indexOf(parts.weekday)
    ];
    const period = parts.dayPeriod === "AM" ? "පෙ.ව." : "ප.ව.";
    return `${weekday}, ${parts.day} ${SINHALA_MONTHS[Number(parts.month) - 1]} ${parts.year} ${period} ${parts.hour}:${parts.minute}:${parts.second}`;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "medium",
    timeZone: TIME_ZONE,
  }).format(date);
}

function formatSelectedDate(date, locale, language) {
  if (language !== "si") {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "full",
      timeZone: TIME_ZONE,
    }).format(date);
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-LK", {
      timeZone: TIME_ZONE,
      weekday: "long",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  const weekday = SINHALA_WEEKDAYS[
    ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
      .indexOf(parts.weekday)
  ];
  return `${weekday}, ${parts.day} ${SINHALA_MONTHS[Number(parts.month) - 1]} ${parts.year}`;
}

export default function LiveCalendar({
  view,
  halls,
  selectedHallId,
  selectedDate: selectedDateProp,
  onHallChange,
  onDateChange,
  onAvailabilityChange = NOOP,
}) {
  const { language, t } = usePreferences();
  const locale = language === "si" ? "si-LK" : "en-LK";
  const [now, setNow] = useState(() => new Date());
  const [month, setMonth] = useState(() => dateInProjectZone().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(
    () => selectedDateProp || dateInProjectZone(),
  );
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionBookingId, setActionBookingId] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const isAdmin = view === "admin";
  const dataScope = `${view}:${month}:${selectedHallId}`;
  const hasCurrentData = updatedAt?.scope === dataScope;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedDateProp) {
      setSelectedDate(selectedDateProp);
      setMonth(selectedDateProp.slice(0, 7));
    }
  }, [selectedDateProp]);

  useEffect(() => {
    let active = true;
    let timer;
    let controller;

    async function refresh() {
      controller = new AbortController();
      setLoading(true);
      try {
        const query = new URLSearchParams({ month });
        if (selectedHallId) query.set("hallId", selectedHallId);
        const path = isAdmin
          ? `/api/admin/calendar/bookings?${query}`
          : `/api/availability?${query}`;
        const result = await apiRequest(path, { signal: controller.signal });
        if (!active) return;
        setEntries(isAdmin ? result.bookings : result.slots);
        if (!isAdmin) {
          onAvailabilityChange({
            hallId: selectedHallId,
            month,
            loaded: true,
            slots: result.slots,
          });
        }
        setError("");
        setUpdatedAt({ at: new Date(), scope: dataScope });
      } catch (requestError) {
        if (active && requestError.name !== "AbortError") {
          setError(getErrorMessage(requestError));
          setUpdatedAt(null);
          if (!isAdmin) {
            onAvailabilityChange({
              hallId: selectedHallId,
              month,
              loaded: false,
              slots: [],
            });
          }
        }
      } finally {
        if (active) {
          setLoading(false);
          timer = setTimeout(refresh, REFRESH_INTERVAL_MS);
        }
      }
    }

    refresh();
    return () => {
      active = false;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [dataScope, isAdmin, month, onAvailabilityChange, selectedHallId, t]);

  const entriesByDate = useMemo(() => {
    const grouped = new Map();
    if (!hasCurrentData) return grouped;
    for (const entry of entries) {
      const dayEntries = grouped.get(entry.date) ?? [];
      dayEntries.push(entry);
      grouped.set(entry.date, dayEntries);
    }
    return grouped;
  }, [entries, hasCurrentData]);

  const calendarDays = useMemo(() => getMonthDays(month), [month]);
  const selectedEntries = entriesByDate.get(selectedDate) ?? [];
  const hasCompletedEntries = hasCurrentData &&
    entries.some((entry) => entry.status === "completed");
  const today = dateInProjectZone(now);
  const currentHall = halls.find((hall) => hall.id === selectedHallId);
  const weekdays = useMemo(
    () => language === "si"
      ? SINHALA_SHORT_WEEKDAYS
      : Array.from({ length: 7 }, (_, index) =>
          new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" })
            .format(new Date(Date.UTC(2024, 0, index + 1))),
        ),
    [language, locale],
  );

  function changeMonth(amount) {
    const nextMonth = shiftMonth(month, amount);
    setMonth(nextMonth);
    setSelectedDate(`${nextMonth}-01`);
  }

  function selectDate(date) {
    setSelectedDate(date);
    onDateChange?.(date);
  }

  async function updateBookingStatus(entry, status) {
    if (
      entry.status === "cancelled" &&
      status === "pending" &&
      !window.confirm(t("Reopening this booking will send it back for admin approval. Continue?"))
    ) {
      return;
    }
    setActionBookingId(entry.id);
    setActionError("");
    try {
      await apiRequest(`/api/admin/calendar/bookings/${entry.id}/status`, {
        method: "PATCH",
        body: { status },
      });
      setEntries((current) =>
        current.map((booking) =>
          booking.id === entry.id ? { ...booking, status } : booking,
        ),
      );
    } catch (requestError) {
      setActionError(
        requestError.message === "BOOKING_STATUS_CONFLICT"
          ? "This booking was already updated. Refresh the calendar before trying again."
          : requestError.message === "BOOKING_TIME_UNAVAILABLE"
            ? "That time now conflicts with another booking. The cancelled booking was not reopened."
            : requestError.message === "BOOKING_DATE_PASSED"
              ? "A booking in the past cannot be reopened."
          : requestError.message === "INVALID_BOOKING_STATUS"
            ? "Invalid booking status"
            : getErrorMessage(requestError),
      );
    } finally {
      setActionBookingId("");
    }
  }

  return (
    <section className="panel live-calendar" aria-labelledby={`${view}-calendar-heading`}>
      <div className="calendar-heading">
        <div>
          <p className="eyebrow">{isAdmin ? t("Administrator") : t("Public schedule")}</p>
          <h2 id={`${view}-calendar-heading`}>
            {isAdmin ? t("Booking calendar") : t("Public booking schedule")}
          </h2>
          {!isAdmin && (
            <p className="calendar-caption">
              {t("View reserved dates, times and halls. Meeting and contact details are private.")}
            </p>
          )}
        </div>
        <div className="live-clock" aria-label={language === "si" ? "ශ්‍රී ලංකාවේ වත්මන් වේලාව" : "Current time in Sri Lanka"}>
          <span className="live-indicator" aria-hidden="true" />
          <time>{formatClock(now, locale, language)}</time>
          <small>Asia/Colombo</small>
        </div>
      </div>

      <label className="field calendar-hall" htmlFor={`${view}-calendar-hall`}>
        <span>{t("Filter by hall")}</span>
        <select
          id={`${view}-calendar-hall`}
          value={selectedHallId}
          onChange={(event) => onHallChange(event.target.value)}
        >
          <option value="">{t("All halls")}</option>
          {halls.map((hall) => (
            <option key={hall.id} value={hall.id}>{hall.name}</option>
          ))}
        </select>
      </label>

      <div className="calendar-toolbar">
        <button
          className="calendar-nav"
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label={t("Previous month")}
        >
          ‹
        </button>
        <h3>{formatMonth(month, locale, language)}</h3>
        <button
          className="calendar-nav"
          type="button"
          onClick={() => changeMonth(1)}
          aria-label={t("Next month")}
        >
          ›
        </button>
      </div>

      <div className="calendar-weekdays" aria-hidden="true">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="calendar-grid" role="group" aria-label={`${formatMonth(month, locale, language)} dates`}>
        {calendarDays.map((date, index) => {
          if (!date) return <span className="calendar-empty" key={`empty-${index}`} />;
          const dayEntries = entriesByDate.get(date) ?? [];
          const hasActiveEntries = dayEntries.some((entry) => entry.status !== "completed");
          const hasCompletedEntries = dayEntries.some((entry) => entry.status === "completed");
          const isSelected = selectedDate === date;
          const isToday = today === date;

          return (
            <button
              className={[
                "calendar-day",
                isSelected ? "selected" : "",
                isToday ? "today" : "",
                hasActiveEntries ? "has-events" : "",
                hasCompletedEntries && !hasActiveEntries ? "has-completed-events" : "",
                hasCurrentData && dayEntries.length === 0 ? "available" : "",
              ].filter(Boolean).join(" ")}
              key={date}
              type="button"
              onClick={() => selectDate(date)}
              aria-pressed={isSelected}
              aria-label={`${date}${dayEntries.length
                ? `, ${isAdmin
                  ? `${dayEntries.length} ${t("Bookings").toLowerCase()}`
                  : dayEntries.every((entry) => entry.status === "completed")
                    ? `${dayEntries.length} ${t("Completed meetings").toLowerCase()}`
                    : t("Reserved time").toLowerCase()}`
                : hasCurrentData
                    ? `, ${t("No bookings on this date").toLowerCase()}`
                    : `, ${t("Waiting for calendar data").toLowerCase()}`}`}
            >
              <span>{Number(date.slice(-2))}</span>
              {dayEntries.length > 0 && (
                <span className="calendar-count" aria-hidden="true">
                  {isAdmin ? dayEntries.length : "•"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="calendar-legend">
        <span><i className="legend-dot today-dot" />{t("Today")}</span>
        <span>
          <i className={`legend-dot ${isAdmin ? "booked-dot" : "busy-dot"}`} />
          {isAdmin ? t("Bookings") : t("Reserved time")}
        </span>
        {!isAdmin && selectedHallId && hasCurrentData && (
          <span><i className="legend-dot available-dot" />{t("No reservations listed")}</span>
        )}
        {hasCompletedEntries && (
          <span>
            <i className="legend-dot completed-dot" />
            {t("Completed meetings")}
          </span>
        )}
      </div>

      <div className="calendar-updates" aria-live="polite">
        {loading ? t("Updating calendar…") : hasCurrentData
          ? `${language === "si" ? "අවසන් යාවත්කාලීන කිරීම" : "Last updated"} ${new Intl.DateTimeFormat(locale, { timeStyle: "medium", timeZone: TIME_ZONE }).format(updatedAt.at)}`
          : t("Waiting for calendar data…")}
        <span>{t("Auto-refreshes every 30 seconds")}</span>
      </div>
      {error && <p className="notice error" role="alert">{t(error)}</p>}
      {actionError && <p className="notice error" role="alert">{t(actionError)}</p>}

      <div className="calendar-events">
        <h3>
          {formatSelectedDate(
            new Date(`${selectedDate}T12:00:00+05:30`),
            locale,
            language,
          )}
        </h3>
        {selectedEntries.length === 0 ? (
          <p className="empty-events">
            {isAdmin
              ? t("No bookings on this date.")
              : t("No reserved times currently listed for this date.")}
          </p>
        ) : (
          <ul className="event-list">
            {selectedEntries.map((entry) => (
              <li
                className={`event-item${entry.status === "completed" ? " completed" : ""}`}
                key={isAdmin ? entry.id : `${entry.hallName}-${entry.startTime}-${entry.endTime}`}
              >
                <span className="event-time">{entry.startTime}–{entry.endTime}</span>
                {isAdmin ? (
                  <div className="event-details">
                    <strong>{entry.meetingTitle}</strong>
                    <span>
                      {entry.hallName} · {entry.contactName}
                      {entry.contactDesignation ? ` · ${entry.contactDesignation}` : ""}
                      {" · "}{entry.contactEmail}
                    </span>
                    <span>{entry.participantCount} participants · {entry.status}</span>
                    {(entry.status === "pending" || entry.status === "approved" || entry.status === "cancelled") && (
                      <span className="event-actions">
                        {entry.status === "pending" && (
                          <>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => updateBookingStatus(entry, "approved")}
                              disabled={actionBookingId === entry.id}
                            >
                              {t(actionBookingId === entry.id ? "Updating booking…" : "Approve")}
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => updateBookingStatus(entry, "rejected")}
                              disabled={actionBookingId === entry.id}
                            >
                              {t("Reject")}
                            </button>
                          </>
                        )}
                        {entry.status === "approved" && (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => updateBookingStatus(entry, "cancelled")}
                            disabled={actionBookingId === entry.id}
                          >
                            {t(actionBookingId === entry.id ? "Updating booking…" : "Cancel booking")}
                          </button>
                        )}
                        {entry.status === "cancelled" && (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => updateBookingStatus(entry, "pending")}
                            disabled={actionBookingId === entry.id}
                          >
                            {t(actionBookingId === entry.id ? "Updating booking…" : "Reopen for approval")}
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="event-details">
                    {entry.hallName ?? currentHall?.name ?? t("Hall")} · {t(
                      entry.status === "completed" ? "Meeting ended" : "Reserved",
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
