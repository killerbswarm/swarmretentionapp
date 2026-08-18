import React from "react";

export default function StatsRow({ personStats, status }) {
  return (
    <div style={styles.personStatsRow}>
      <div style={styles.personStatBox}>
        <span style={styles.personStatLabel}>Next Week Starts</span>
        <span style={styles.personStatValue}>{personStats.nextWeekStartDateStr}</span>
        <span style={styles.personStatSubText}>
          {status === "pending"
            ? "Pending 1st visit"
            : personStats.activeWeeks >= 12
            ? "12 Wks Completed"
            : `Week ${personStats.nextWeekNum} in ${personStats.daysUntilNextWeek} days`}
        </span>
      </div>

      <div style={styles.personStatBox}>
        <span style={styles.personStatLabel}>Total Check-Ins</span>
        <span style={styles.personStatValue}>{personStats.totalAllTimeVisits} visits</span>
        <span style={styles.personStatSubText}>
          {personStats.totalCheckinsSource === "chip"
            ? "From Chalk It Pro"
            : "Across all weeks"}
        </span>
      </div>

      <div style={styles.personStatBox}>
        <span style={styles.personStatLabel}>Avg Weekly Pace</span>
        <span style={styles.personStatValue}>{personStats.avgWeeklyVisitsPerson} / wk</span>
        <span style={styles.personStatSubText}>
          Proj. {personStats.projected12WkTotal} visits total
        </span>
      </div>

      <div style={styles.personStatBox}>
        <span style={styles.personStatLabel}>Time Active</span>
        <span style={styles.personStatValue}>{personStats.daysActive} days</span>
        <span style={styles.personStatSubText}>Since 1st Check-In</span>
      </div>
    </div>
  );
}

const styles = {
  personStatsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "10px",
    marginBottom: "16px",
  },
  personStatBox: {
    backgroundColor: "#f8fafc",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
  },
  personStatLabel: {
    fontSize: "10px",
    color: "#64748b",
    textTransform: "uppercase",
    fontWeight: "700",
  },
  personStatValue: {
    fontSize: "15px",
    fontWeight: "800",
    color: "#0f172a",
    marginTop: "2px",
  },
  personStatSubText: {
    fontSize: "11px",
    color: "#94a3b8",
    marginTop: "2px",
  },
};
