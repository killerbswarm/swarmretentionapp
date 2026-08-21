import React from "react";

export default function AtRiskView({
  styles,
  atRiskMembers,
  daysOutLive,
  masterByEmail,
  setSelectedAtRiskMember
}) {
  return (
<div>
  <div className="ar-metrics" style={styles.metricsGrid}>
    <div style={styles.metricCard}>
      <span style={styles.metricLabel}>Total At Risk</span>
      <span style={styles.metricValue}>{atRiskMembers.length}</span>
      <span style={styles.metricSubText}>Currently out 7+ days</span>
    </div>

 <div style={styles.metricCard}>
      <span style={styles.metricLabel}>Avg Days Out</span>
      <span style={styles.metricValue}>
        {atRiskMembers.length
          ? Math.round(
              atRiskMembers
                .map((m) => daysOutLive(m))
                .filter((d) => d > 0 && d < 500)
                .reduce((sum, d) => sum + d, 0) /
              atRiskMembers.filter((m) => { const d = daysOutLive(m); return d > 0 && d < 500; }).length
            )
          : 0}
      </span>
      <span style={styles.metricSubText}>Average time away</span>
    </div>

    <div style={styles.metricCard}>
      <span style={styles.metricLabel}>Longest Out</span>
      <span style={styles.metricValue}>
        {atRiskMembers.length
          ? Math.max(...atRiskMembers.map((m) => daysOutLive(m)))
          : 0}
      </span>
      <span style={styles.metricSubText}>Days since last visit</span>
    </div>
  </div>
    <h3 style={{ marginTop: 0, marginBottom: "4px" }}>At Risk Members</h3>
    <p style={{ color: "#64748b", marginBottom: "20px", fontSize: "14px" }}>
      Members who have not visited in 7+ days
    </p>

    <div className="ar-table" style={styles.tableContainer}>
      <table style={styles.table}>
        <thead>
        <tr style={styles.tableHeader}>
          <th style={styles.th}>Member</th>
          <th style={styles.th}>Days Out</th>
          <th style={styles.th}>Last Check-In</th>
          <th style={styles.th}>At Risk Since</th>
          <th style={styles.th}>Reach-outs</th>
          <th style={{ ...styles.th, textAlign: "right" }}>Details</th>
        </tr>
        </thead>
        <tbody>
          {atRiskMembers.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
                No members currently at risk
              </td>
            </tr>
          ) : (
            atRiskMembers.map((member) => (
              <tr
                key={member.id}
                style={styles.clickableTableRow}
                onClick={() => setSelectedAtRiskMember(member)}
              >
                <td style={styles.td}>
                  <div style={styles.memberName}>
                    {member.firstName} {member.lastName}
                  </div>

                </td>
                <td style={styles.td}>
                  <span style={{
                    backgroundColor: "#fef2f2",
                    color: "#dc2626",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "700"
                  }}>
                    {daysOutLive(member)} days
                  </span>
                </td>
                <td style={styles.td}>
                  {(() => {
                    const email = (member.email || "").toLowerCase();
                    const masterLast = masterByEmail[email]?.lastDate;
                    if (masterLast) return masterLast;
                    if (member.lastCheckIn) return new Date(member.lastCheckIn).toLocaleDateString();
                    return "—";
                  })()}
                </td>
                <td style={styles.td}>
                  {member.atRiskSince
                    ? new Date(member.atRiskSince).toLocaleDateString()
                    : "—"}
                </td>
<td style={styles.td}>
  {(member.reachOuts || []).length === 0 ? (
    <span style={{ color: "#94a3b8", fontSize: 12 }}>None</span>
  ) : (
    <span
      style={{
        backgroundColor: "#dbeafe",
        color: "#1d4ed8",
        padding: "3px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {(member.reachOuts || []).length} reach-out
      {(member.reachOuts || []).length === 1 ? "" : "s"}
    </span>
  )}
</td>
                <td style={{ ...styles.td, textAlign: "right", color: "#64748b" }}>
                  View →
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
    <div className="ar-cards" style={{ display: "none", flexDirection: "column", gap: 10 }}>
      {atRiskMembers.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>No members currently at risk</div>
      ) : atRiskMembers.map((member) => (
        <button
          key={member.id}
          type="button"
          onClick={() => setSelectedAtRiskMember(member)}
          style={{
            textAlign: "left",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 12,
            cursor: "pointer",
            width: "100%",
            boxSizing: "border-box"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.3 }}>
              <span style={{ fontWeight: 800 }}>{member.firstName} {member.lastName}</span>
              <span style={{ color: "#64748b", fontWeight: 500 }}>
                {" · "}
                {masterByEmail[(member.email || "").toLowerCase()]?.lastDate
                  || (member.lastCheckIn ? new Date(member.lastCheckIn).toLocaleDateString() : "—")}
              </span>
            </div>
            <div style={{
              background: "#fef2f2", color: "#dc2626", fontWeight: 800, fontSize: 12,
              borderRadius: 8, padding: "4px 8px", height: "fit-content", flexShrink: 0
            }}>
              {daysOutLive(member)} days
            </div>
          </div>
        </button>
      ))}
    </div>
  </div>

  );
}