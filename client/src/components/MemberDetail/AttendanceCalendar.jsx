import React from "react";

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

function tooltipForDay(dateKey, logs) {
  if (!logs || !logs.length) return dateKey;
  const lines = logs.map((log) => {
    const name = log.className || "Check-in";
    const time =
      formatClassTime(log.classTime) ||
      (log.timestamp
        ? new Date(log.timestamp).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit"
          })
        : "");
    const week = log.weekNumber ? ` · Wk ${log.weekNumber}` : "";
    return time ? `${name} @ ${time}${week}` : `${name}${week}`;
  });
  return `${dateKey}\n${lines.join("\n")}`;
}

export default function AttendanceCalendar({
  selectedMember,
  threeMonthCalendars,
  checkInDatesSet,
  memberCheckIns = []
}) {
  const now = new Date();
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

  return (
    <div style={styles.sectionCard}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px"
        }}
      >
        <h4 style={{ margin: 0, fontSize: "13px", textTransform: "uppercase", color: "#374151" }}>
          3-Month Onboarding Attendance Calendar
        </h4>
        <div style={{ display: "flex", gap: "12px", fontSize: "11px", fontWeight: "600", color: "#64748b" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                backgroundColor: "#22c55e",
                borderRadius: "2px",
                display: "inline-block"
              }}
            ></span>
            Visit Day
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                backgroundColor: "#fff",
                border: "2px solid #2563eb",
                borderRadius: "2px",
                display: "inline-block"
              }}
            ></span>
            Today
          </span>
        </div>
      </div>

      {selectedMember.status === "pending" || !selectedMember.startDate ? (
        <div
          style={{
            padding: "16px",
            backgroundColor: "#eff6ff",
            borderRadius: "8px",
            border: "1px solid #bfdbfe",
            textAlign: "center",
            color: "#1d4ed8",
            fontSize: "13px"
          }}
        >
          ⏳ Calendar view will automatically populate here once the member completes their first check-in class.
        </div>
      ) : (
        <div style={styles.calendarGridContainer}>
          {threeMonthCalendars.map((mObj, mIdx) => (
            <div key={mIdx} style={styles.calendarMonthCard}>
              <div style={styles.calendarMonthTitle}>{mObj.monthName}</div>

              <div style={styles.calendarHeaderRow}>
                {["S", "M", "T", "W", "T", "F", "S"].map((dayName, dIdx) => (
                  <div key={dIdx} style={styles.calendarHeaderCell}>
                    {dayName}
                  </div>
                ))}
              </div>

              <div style={styles.calendarDaysGrid}>
                {[...Array(mObj.firstDayOfWeek)].map((_, emptyIdx) => (
                  <div key={`empty-${emptyIdx}`} style={styles.calendarDayEmpty} />
                ))}

                {[...Array(mObj.daysInMonth)].map((_, dayIdx) => {
                  const dayNum = dayIdx + 1;
                  const dateKey = `${mObj.year}-${String(mObj.month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                  const dayLogs = logsByDate[dateKey] || [];
                  const hasVisit = checkInDatesSet.has(dateKey) || dayLogs.length > 0;
                  const isToday = dateKey === todayKey;

                  let weekBadgeLabel = null;
                  if (selectedMember.startDate) {
                    const sObj = new Date(selectedMember.startDate);
                    const startLocal = new Date(sObj.getFullYear(), sObj.getMonth(), sObj.getDate());
                    const cellLocal = new Date(mObj.year, mObj.month, dayNum);
                    const diffDays = Math.round((cellLocal - startLocal) / (1000 * 60 * 60 * 24));
                    if (diffDays >= 0 && diffDays < 84 && diffDays % 7 === 0) {
                      weekBadgeLabel = `W${Math.floor(diffDays / 7) + 1}`;
                    }
                  }

                  let cellStyle = { ...styles.calendarDayCell };
                  if (hasVisit) cellStyle = { ...cellStyle, ...styles.calendarDayVisited };
                  if (isToday) {
                    cellStyle = {
                      ...cellStyle,
                      border: "2px solid #2563eb",
                      boxShadow: "0 0 0 1px #2563eb"
                    };
                  }

                  return (
                    <div
                      key={dayNum}
                      style={{ ...cellStyle, cursor: hasVisit ? "help" : "default" }}
                      title={tooltipForDay(dateKey, dayLogs)}
                    >
                      {weekBadgeLabel && <span style={styles.calendarWeekBadge}>{weekBadgeLabel}</span>}
                      <span style={{ marginTop: weekBadgeLabel ? "-2px" : "0" }}>{dayNum}</span>
                      {hasVisit && <span style={{ fontSize: "8px", lineHeight: "1" }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  sectionCard: {
    backgroundColor: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "16px"
  },
  calendarGridContainer: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "12px"
  },
  calendarMonthCard: {
    backgroundColor: "#f8fafc",
    borderRadius: "8px",
    padding: "10px",
    border: "1px solid #e2e8f0"
  },
  calendarMonthTitle: {
    fontSize: "13px",
    fontWeight: "700",
    color: "#334155",
    marginBottom: "8px",
    textAlign: "center"
  },
  calendarHeaderRow: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    marginBottom: "4px"
  },
  calendarHeaderCell: {
    fontSize: "10px",
    fontWeight: "700",
    color: "#94a3b8",
    textAlign: "center"
  },
  calendarDaysGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "2px"
  },
  calendarDayEmpty: {
    height: "28px"
  },
  calendarDayCell: {
    height: "28px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
    borderRadius: "4px",
    backgroundColor: "#fff",
    border: "1px solid #e2e8f0"
  },
  calendarDayVisited: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    color: "#15803d",
    fontWeight: "700"
  },
  calendarWeekBadge: {
    fontSize: "8px",
    fontWeight: "800",
    color: "#2563eb",
    lineHeight: "1"
  }
};
