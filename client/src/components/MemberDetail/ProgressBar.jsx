import React from "react";

export default function ProgressBar({ 
  progressPct, 
  status, 
  currentWeek 
}) {
  return (
    <div style={styles.progressCard}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        fontSize: "12px", 
        fontWeight: "700", 
        color: "#334155", 
        marginBottom: "6px" 
      }}>
        <span>12-Week Journey Progress ({progressPct}%)</span>
        <span>
          {status === "pending" 
            ? "Pending Start" 
            : `Week ${currentWeek} of 12`}
        </span>
      </div>
      <div style={styles.progressBarTrack}>
        <div style={{ 
          ...styles.progressBarFill, 
          width: `${progressPct}%` 
        }} />
      </div>
    </div>
  );
}

const styles = {
  progressCard: {
    backgroundColor: "#f8fafc",
    padding: "12px 16px",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    marginBottom: "16px",
  },
  progressBarTrack: {
    backgroundColor: "#e2e8f0",
    height: "8px",
    borderRadius: "4px",
    overflow: "hidden",
  },
  progressBarFill: {
    backgroundColor: "#2563eb",
    height: "100%",
    borderRadius: "4px",
    transition: "width 0.3s ease",
  },
};