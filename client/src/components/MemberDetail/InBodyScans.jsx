import React from "react";

export default function InBodyScans({ 
  selectedMember, 
  scansCompleted, 
  scanPct, 
  onToggleScan 
}) {
  return (
    <div style={styles.sectionCard}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        marginBottom: "10px" 
      }}>
        <h4 style={{ margin: 0, fontSize: "13px", textTransform: "uppercase", color: "#374151" }}>
          InBody Scans Checklist
        </h4>
        <span style={{ fontSize: "12px", fontWeight: "700", color: "#16a34a" }}>
          {scansCompleted} / 3 Complete ({scanPct}%)
        </span>
      </div>

      <div style={{ display: "flex", gap: "12px" }}>
        {["scan1", "scan2", "scan3"].map((scanKey, idx) => {
          const isDone = selectedMember.inBodyScans?.[scanKey];
          return (
            <button
              key={scanKey}
              onClick={() => onToggleScan(selectedMember.id, scanKey)}
              style={isDone ? styles.scanBoxDone : styles.scanBoxPending}
            >
              <span style={{ fontSize: "16px" }}>{isDone ? "✓" : "○"}</span>
              <span>Scan {idx + 1} {isDone ? "(Done)" : "(Pending)"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  sectionCard: {
    backgroundColor: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "16px",
  },
  scanBoxDone: {
    flex: 1,
    backgroundColor: "#dcfce7",
    color: "#15803d",
    border: "1px solid #86efac",
    padding: "10px",
    borderRadius: "6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    fontWeight: "600",
    fontSize: "13px",
  },
  scanBoxPending: {
    flex: 1,
    backgroundColor: "#f8fafc",
    color: "#64748b",
    border: "1px solid #cbd5e1",
    padding: "10px",
    borderRadius: "6px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    fontWeight: "500",
    fontSize: "13px",
  },
};