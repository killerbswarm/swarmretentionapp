import React from "react";

export default function MemberHeader({ 
  selectedMember, 
  riskInfo, 
  onClose 
}) {
  return (
    <div style={styles.personHeader}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h2 style={{ margin: 0, fontSize: "24px" }}>
            {selectedMember.firstName} {selectedMember.lastName}
          </h2>
          <span style={{ 
            backgroundColor: riskInfo.bg, 
            color: riskInfo.color, 
            padding: "4px 10px", 
            borderRadius: "8px", 
            fontSize: "12px", 
            fontWeight: "700" 
          }}>
            {riskInfo.label}
          </span>
        </div>
        <p style={{ margin: "4px 0 0 0", color: "#6b7280", fontSize: "14px" }}>
          {selectedMember.email} • {selectedMember.phone || "No phone"}
        </p>
      </div>
      <button style={styles.closeBtn} onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

const styles = {
  personHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "20px 24px",
    borderBottom: "1px solid #e2e8f0",
    position: "sticky",
    top: 0,
    background: "#fff",
    zIndex: 10,
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: "22px",
    cursor: "pointer",
    color: "#64748b",
    padding: "4px 8px",
  },
};