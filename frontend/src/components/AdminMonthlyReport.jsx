import { useEffect, useMemo, useState } from "react";
import { apiRequest, getErrorMessage } from "../services/api.js";
import { usePreferences } from "../context/PreferencesContext.jsx";

const TIME_ZONE = "Asia/Colombo";

function currentMonth() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}`;
}

function createMonthDays(month, data) {
  const [year, monthNumber] = month.split("-").map(Number);
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const countsByDate = new Map(data.map((day) => [day.date, day]));

  return Array.from({ length: dayCount }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    return countsByDate.get(date) ?? {
      date,
      totalRequests: 0,
      completedMeetings: 0,
      scheduledMeetings: 0,
      pendingRequests: 0,
      closedRequests: 0,
    };
  });
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export default function AdminMonthlyReport() {
  const { language, t } = usePreferences();
  const [month, setMonth] = useState(currentMonth);
  const [dailyData, setDailyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const locale = language === "si" ? "si-LK" : "en-LK";
  const generatedAt = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    apiRequest(`/api/admin/reports/monthly?month=${encodeURIComponent(month)}`, {
      signal: controller.signal,
    })
      .then((result) => {
        setDailyData(result.days);
        setError("");
      })
      .catch((requestError) => {
        if (requestError.name !== "AbortError") {
          setDailyData([]);
          setError(getErrorMessage(requestError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [month]);

  const days = useMemo(() => createMonthDays(month, dailyData), [dailyData, month]);
  const totals = useMemo(
    () => days.reduce((sum, day) => ({
      totalRequests: sum.totalRequests + day.totalRequests,
      completedMeetings: sum.completedMeetings + day.completedMeetings,
      scheduledMeetings: sum.scheduledMeetings + day.scheduledMeetings,
      pendingRequests: sum.pendingRequests + day.pendingRequests,
      closedRequests: sum.closedRequests + day.closedRequests,
    }), {
      totalRequests: 0,
      completedMeetings: 0,
      scheduledMeetings: 0,
      pendingRequests: 0,
      closedRequests: 0,
    }),
    [days],
  );
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date(`${month}-15T12:00:00+05:30`));

  function formatDate(date) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: TIME_ZONE,
    }).format(new Date(`${date}T12:00:00+05:30`));
  }

  function downloadCsv() {
    const rows = [
      [t("Date"), t("Total requests"), t("Meetings"), t("Completed"), t("Scheduled"), t("Pending"), t("Cancelled / rejected")],
      ...days.map((day) => [
        day.date,
        day.totalRequests,
        day.completedMeetings + day.scheduledMeetings,
        day.completedMeetings,
        day.scheduledMeetings,
        day.pendingRequests,
        day.closedRequests,
      ]),
      [
        t("Monthly total"),
        totals.totalRequests,
        totals.completedMeetings + totals.scheduledMeetings,
        totals.completedMeetings,
        totals.scheduledMeetings,
        totals.pendingRequests,
        totals.closedRequests,
      ],
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `conference-hall-report-${month}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <section className="monthly-report" aria-labelledby="monthly-report-heading">
      <header className="report-document-header">
        <img
          className="report-document-emblem"
          src="/sri-lanka-state-emblem.png"
          alt=""
          aria-hidden="true"
        />
        <div className="report-document-identity">
          <p>{t("Government of Sri Lanka")}</p>
          <strong>{t("Ministry of Digital Economy")}</strong>
          <span>{t("Conference Hall Booking")}</span>
        </div>
        <div className="report-document-title">
          <h1>{t("Monthly meeting report")}</h1>
          <p>{monthLabel}</p>
        </div>
      </header>

      <div className="panel-heading report-heading">
        <div>
          <p className="eyebrow">{t("Reports")}</p>
          <h2 id="monthly-report-heading">{t("Monthly meeting report")}</h2>
          <p>{t("Review daily meeting and booking request counts for a selected month.")}</p>
        </div>
        <label className="field report-month" htmlFor="report-month">
          <span>{t("Report month")}</span>
          <input
            id="report-month"
            type="month"
            value={month}
            onChange={(event) => {
              if (event.target.value) setMonth(event.target.value);
            }}
          />
        </label>
      </div>

      <div className="report-actions">
        <button className="secondary-button" type="button" onClick={downloadCsv} disabled={loading || Boolean(error)}>
          {t("Download CSV")}
        </button>
        <button className="secondary-button" type="button" onClick={() => window.print()} disabled={loading || Boolean(error)}>
          {t("Print report")}
        </button>
      </div>

      {error && <p className="notice error" role="alert">{t(error)}</p>}
      {loading && <p role="status">{t("Loading monthly report…")}</p>}
      {!loading && !error && (
        <>
          <div className="report-summary" aria-label={t("Monthly summary")}>
            <div className="report-metric">
              <span>{t("Total requests")}</span>
              <strong>{totals.totalRequests}</strong>
            </div>
            <div className="report-metric">
              <span>{t("Meetings")}</span>
              <strong>{totals.completedMeetings + totals.scheduledMeetings}</strong>
            </div>
            <div className="report-metric">
              <span>{t("Completed")}</span>
              <strong>{totals.completedMeetings}</strong>
            </div>
            <div className="report-metric">
              <span>{t("Scheduled")}</span>
              <strong>{totals.scheduledMeetings}</strong>
            </div>
            <div className="report-metric">
              <span>{t("Pending")}</span>
              <strong>{totals.pendingRequests}</strong>
            </div>
            <div className="report-metric">
              <span>{t("Cancelled / rejected")}</span>
              <strong>{totals.closedRequests}</strong>
            </div>
          </div>

          <div className="report-table-scroll">
            <table className="report-table">
              <caption>{t("Daily meeting and request counts")} — {monthLabel}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("Date")}</th>
                  <th scope="col">{t("Total requests")}</th>
                  <th scope="col">{t("Meetings")}</th>
                  <th scope="col">{t("Completed")}</th>
                  <th scope="col">{t("Scheduled")}</th>
                  <th scope="col">{t("Pending")}</th>
                  <th scope="col">{t("Cancelled / rejected")}</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.date}>
                    <th scope="row">{formatDate(day.date)}</th>
                    <td>{day.totalRequests}</td>
                    <td>{day.completedMeetings + day.scheduledMeetings}</td>
                    <td>{day.completedMeetings}</td>
                    <td>{day.scheduledMeetings}</td>
                    <td>{day.pendingRequests}</td>
                    <td>{day.closedRequests}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t("Monthly total")}</th>
                  <td>{totals.totalRequests}</td>
                  <td>{totals.completedMeetings + totals.scheduledMeetings}</td>
                  <td>{totals.completedMeetings}</td>
                  <td>{totals.scheduledMeetings}</td>
                  <td>{totals.pendingRequests}</td>
                  <td>{totals.closedRequests}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="report-note">{t("Meeting counts include approved and completed meetings. Pending requests and cancelled or rejected requests are reported separately.")}</p>
          <footer className="report-document-footer">
            <span>{t("Report generated")}: {generatedAt}</span>
            <span>{t("All dates and completion times use Sri Lanka time.")}</span>
          </footer>
        </>
      )}
    </section>
  );
}
