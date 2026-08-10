import React from "react";

export default function MemberFooter({ memberId, onDeleteMember }) {
  return (
    <div style={styles.footer}>
      <span style={styles.memberId}>Member ID: {memberId}</span>
      <button 
        style={styles.deleteBtn}
        onClick={() => onDeleteMember(memberId)}
      >
        Delete Member
      </button>
    </div>
  );
}

const styles = {
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: "12px",
    borderTop: "1px solid #e5e7eb",
  },
  memberId: {
    fontSize: "12px",
    color: "#9ca3af",
  },
  deleteBtn: {
    backgroundColor: "#ef4444",
    color: "#fff",
    border: "none",
    padding: "8px 14px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
};