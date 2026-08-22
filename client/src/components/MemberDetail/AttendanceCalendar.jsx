import React, { useState } from "react";
import { programWeek1Monday, weekNumberForClassDate } from "../../utils/helpers";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function formatClassTime(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2}):(\d{1,2})(\s*[ap]m)?$/i);
  if (!m) return s;
  return `${m[1]}:${String(m[2]).padStart(2, "0")}${m[3] || ""}`;
}

function dateKeyFromLog(log) {
  if (log.classDate) return log.classDate;
  if (log._dateKey) return log._dateKey;
  if (log.timestamp) {
    const d = new Date(log.timestamp);
    if (!isNaN(d)) {
      return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")
      ].join("-");
    }
  }
  return null;
}

function prettyDate(dateKey) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  if (!y) return dateKey;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

export default function AttendanceCalendar({
  selectedMember,
  checkInDatesSet,
  memberCheckIns = [],
  onAddCheckIn,
  onDeleteLog,
  weekStartDay = 0,
}) {
  const now = new Date();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [openDay, setOpenDay] = useState(null);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const todayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  const logsByDate = {};
  (memberCheckIns || []).forEach((log) => {
    const key = dateKeyFromLog(log);
    if (!key) return;
    if (!logsByDate[key]) logsByDate[key] = [];
    logsByDate[key].push(log);
  });

  const openLogs = openDay ? (logsByDate[openDay] || []) : [];

  return (
    <div style={styles.sectionCard}>
      <div style={styles.topRow}>
        <h4 style={styles.title}>Attendance</h4>
        <div style={styles.legend}>
          <span style={styles.legendItem}><span style={styles.dotGreen} /> Visit</span>
          <span style={styles.legendItem}><span style={styles.dotToday} /> Today</span>
        </div>
      </div>

      {selectedMember.status === "pending" || !selectedMember.startDate ? (
        <div style={styles.pendingBox}>
          Tap a day to log the first check-in and start the 12-week.
        </div>
      ) : null}

      <div style={styles.navRow}>
        <button type="button" style={styles.navBtn} onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button>
        <div style={styles.monthLabel}>{MONTHS[month]} {year}</div>
        <button type="button" style={styles.navBtn} onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button>
      </div>

      <style>{`
        .att-day {
          min-height: 36px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          border-radius: 8px;
          position: relative;
          background: #fff;
          color: #0f172a;
          border: 1px solid #e2e8f0;
          cursor: pointer;
        }
        .att-day.visit {
          background: #dcfce7;
          color: #15803d;
          font-weight: 700;
          border: 1px solid #86efac;
        }
        .att-day.today { border: 2px solid #2563eb; }
        .att-day:hover { background: #f1f5f9; }
        .att-day.visit:hover { background: #bbf7d0; }
      `}</style>

      <div style={styles.headerRow}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={styles.headerCell}>{d}</div>
        ))}
      </div>

      <div style={styles.daysGrid}>
        {[...Array(firstDayOfWeek)].map((_, i) => (
          <div key={"e-" + i} style={styles.empty} />
        ))}
        {[...Array(daysInMonth)].map((_, dayIdx) => {
          const dayNum = dayIdx + 1;
          const dateKey = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(dayNum).padStart(2, "0");
          const dayLogs = logsByDate[dateKey] || [];
          const hasVisit = (checkInDatesSet && checkInDatesSet.has(dateKey)) || dayLogs.length > 0;
          const isToday = dateKey === todayKey;

          let weekBadgeLabel = null;
          if (selectedMember.startDate) {
            const cellLocal = new Date(year, month, dayNum, 12, 0, 0);
            // Badge on Sundays that start a program week (W1–W12)
            if (cellLocal.getDay() === Number(weekStartDay)) {
              const dateKeyCell =
                year +
                "-" +
                String(month + 1).padStart(2, "0") +
                "-" +
                String(dayNum).padStart(2, "0");
              const wn = weekNumberForClassDate(selectedMember.startDate, dateKeyCell, weekStartDay);
              if (wn && wn >= 1 && wn <= 12) weekBadgeLabel = "W" + wn;
            }
          }

          return (
            <div
              key={dayNum}
              title={hasVisit ? "Edit / delete check-in" : "Add check-in"}
              className={"att-day" + (hasVisit ? " visit" : "") + (isToday ? " today" : "")}
              onClick={() => setOpenDay(dateKey)}
            >
              {weekBadgeLabel && <span style={styles.weekBadge}>{weekBadgeLabel}</span>}
              <span>{dayNum}</span>
              {hasVisit && dayLogs[0] && dayLogs[0].classTime && (
                <span style={styles.timeHint}>{formatClassTime(dayLogs[0].classTime)}</span>
              )}
              {hasVisit && !(dayLogs[0] && dayLogs[0].classTime) && <span style={styles.check}>✓</span>}
            </div>
          );
        })}
      </div>

      {openDay && (
        <div style={styles.sheetMask} onClick={() => setOpenDay(null)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHead}>
              <div>
                <div style={styles.sheetTitle}>{prettyDate(openDay)}</div>
                <div style={styles.sheetSub}>
                  {openLogs.length ? openLogs.length + " check-in" + (openLogs.length > 1 ? "s" : "") : "No check-in"}
                </div>
              </div>
              <button type="button" style={styles.closeX} onClick={() => setOpenDay(null)}>✕</button>
            </div>

            {openLogs.map((log) => (
              <div key={log.id || log.timestamp} style={styles.logRow}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {log.className || log.source || "Check-in"}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {formatClassTime(log.classTime) || (log.timestamp
                      ? new Date(log.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                      : "")}
                    {log.weekNumber ? " · Week " + log.weekNumber : ""}
                  </div>
                </div>
                {onDeleteLog && log.id && (
                  <button type="button" style={styles.deleteBtn} onClick={() => onDeleteLog(log)}>
                    Delete
                  </button>
                )}
              </div>
            ))}

            {onAddCheckIn && openLogs.length === 0 && (
              <button
                type="button"
                style={styles.addBtn}
                onClick={async () => {
                  await onAddCheckIn(openDay);
                  setOpenDay(null);
                }}
              >
                {selectedMember.status === "pending" ? "Log first check-in" : "+ Add check-in"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  sectionCard: { backgroundColor: "#fff", padding: 8, position: "relative" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 },
  title: { margin: 0, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em", color: "#374151" },
  legend: { display: "flex", gap: 10, fontSize: 11, fontWeight: 600, color: "#64748b" },
  legendItem: { display: "flex", alignItems: "center", gap: 4 },
  dotGreen: { width: 10, height: 10, backgroundColor: "#22c55e", borderRadius: 2, display: "inline-block" },
  dotToday: {
    width: 10, height: 10, backgroundColor: "#fff",
    borderWidth: 2, borderStyle: "solid", borderColor: "#2563eb",
    borderRadius: 2, display: "inline-block"
  },
  pendingBox: {
    padding: 10, backgroundColor: "#eff6ff", borderRadius: 8,
    textAlign: "center", color: "#1d4ed8", fontSize: 13, marginBottom: 8
  },
  navRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  navBtn: {
    width: 32, height: 32, borderRadius: 10,
    borderWidth: 1, borderStyle: "solid", borderColor: "#e2e8f0",
    background: "#f8fafc", fontSize: 20, cursor: "pointer", color: "#0f172a"
  },
  monthLabel: { fontSize: 16, fontWeight: 800, color: "#0f172a" },
  headerRow: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 },
  headerCell: { fontSize: 11, fontWeight: 700, color: "#94a3b8", textAlign: "center", padding: "4px 0" },
  daysGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 },
  empty: { minHeight: 32 },
  weekBadge: { position: "absolute", top: 2, left: 3, fontSize: 8, fontWeight: 800, color: "#2563eb" },
  timeHint: { fontSize: 8, lineHeight: 1, color: "#166534", fontWeight: 700 },
  check: { fontSize: 8, lineHeight: 1 },
  sheetMask: {
    position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)",
    display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 20
  },
  sheet: {
    width: "100%", background: "#fff", borderRadius: "16px 16px 0 0",
    padding: 16, maxHeight: "70%", overflowY: "auto"
  },
  sheetHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a" },
  sheetSub: { fontSize: 12, color: "#64748b" },
  closeX: { border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#64748b" },
  logRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 0", borderBottom: "1px solid #e2e8f0"
  },
  deleteBtn: {
    border: "none", background: "#fef2f2", color: "#dc2626",
    padding: "6px 10px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 12
  },
  addBtn: {
    marginTop: 12, width: "100%", border: "none", background: "#16a34a", color: "#fff",
    padding: "12px", borderRadius: 10, fontWeight: 700, cursor: "pointer"
  }
};