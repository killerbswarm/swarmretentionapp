import React from "react";

export default function StatsRow({ personStats, status }) {
  const nextSub =
    status === "pending"
      ? "Pending"
      : personStats.activeWeeks >= 12
      ? "Done"
      : `${personStats.daysUntilNextWeek}d`;

  return (
    <div className="md-stats" style={styles.personStatsRow}>
      <div style={styles.personStatBox}>
        <span style={styles.personStatLabel}>Next wk</span>
        <span style={styles.personStatValue}>{personStats.nextWeekStartDateStr}</span>
      </div>
      <div style={styles.personStatBox}>
        <span style={styles.personStatLabel}>Check-ins</span>
        <span style={styles.personStatValue}>{personStats.totalAllTimeVisits}</span>
      </div>
      <div style={styles.personStatBox}>
        <span style={styles.personStatLabel}>Pace</span>
        <span style={styles.personStatValue}>{personStats.avgWeeklyVisitsPerson}/wk</span>
      </div>
      <div style={styles.personStatBox}>
        <span style={styles.personStatLabel}>Active</span>
        <span style={styles.personStatValue}>{personStats.daysActive}d</span>
      </div>
    </div>
  );
}

const styles = {
  personStatsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 6,
    marginBottom: 10,
  },
  personStatBox: {
    backgroundColor: "#f8fafc",
    padding: "6px 6px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    minWidth: 0,
  },
  personStatLabel: {
    fontSize: 9,
    color: "#64748b",
    textTransform: "uppercase",
    fontWeight: 700,
    letterSpacing: "0.02em",
  },
  personStatValue: {
    display: "block",
    fontSize: 12,
    fontWeight: 800,
    color: "#0f172a",
    marginTop: 2,
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};