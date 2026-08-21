import React from "react";
import { getMemberRiskInfo } from "../utils/helpers";

export default function TwelveWeekView({
  styles,
  members,
  filter,
  setFilter,
  pendingMembers,
  activeMembers,
  highRiskMembers,
  filteredMembers,
  avgVisitsPerWeek,
  inBodyCompletionRate,
  totalScansCompleted,
  possibleScans,
  isMobile,
  getMasterWeekVisits,
  getOnboardingWeekNumber,
  getWeekVisitCount,
  daysOutLive,
  setSelectedAtRiskMember,
  handleOpenPersonView
}) {
  return (
<>
    {/* STATS CARDS */}
    <div style={styles.statsRow}>
     {/* Metrics Overview */}
      <div className="tw-metrics" style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Active Onboarding</span>
          <span style={styles.metricValue}>{activeMembers.length}</span>
          <span style={styles.metricSubText}>In 12-week program</span>
        </div>
        <div style={{ ...styles.metricCard, borderColor: "#3b82f6", backgroundColor: "#eff6ff" }}>
          <span style={{ ...styles.metricLabel, color: "#1e40af" }}>Pending 1st Class</span>
          <span style={{ ...styles.metricValue, color: "#2563eb" }}>{pendingMembers.length}</span>
          <span style={styles.metricSubText}>Signed up, waiting</span>
        </div>
        <div style={{ ...styles.metricCard, borderColor: "#ef4444", backgroundColor: "#fef2f2" }}>
          <span style={{ ...styles.metricLabel, color: "#991b1b" }}>High Risk</span>
          <span style={{ ...styles.metricValue, color: "#dc2626" }}>{highRiskMembers.length}</span>
          <span style={styles.metricSubText}>Behind on weekly pace</span>
        </div>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Avg Weekly Visits</span>
          <span style={styles.metricValue}>{avgVisitsPerWeek}</span>
          <span style={styles.metricSubText}>Per active member</span>
        </div>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>InBody Scan Rate</span>
          <span style={styles.metricValue}>{inBodyCompletionRate}%</span>
          <span style={styles.metricSubText}>{totalScansCompleted} / {possibleScans} scans done</span>
        </div>
      </div>
    </div>
        {/* FILTERS */}
    <div className="tw-filters" style={styles.filterBar}>
      <button
        style={filter === "all" ? styles.activeFilterBtn : styles.filterBtn}
        onClick={() => setFilter("all")}
      >
        All Members ({members.filter(m => m.status !== "cancelled").length})
      </button>
      <button
        style={filter === "pending" ? styles.activeFilterBtn : styles.filterBtn}
        onClick={() => setFilter("pending")}
      >
        ⏳ Pending ({pendingMembers.length})
      </button>
      <button
        style={filter === "active" ? styles.activeFilterBtn : styles.filterBtn}
        onClick={() => setFilter("active")}
      >
        🔥 Active ({activeMembers.length})
      </button>
      <button
        style={filter === "high_risk" ? styles.activeFilterBtn : styles.filterBtn}
        onClick={() => setFilter("high_risk")}
      >
        ⚠️ High Risk ({highRiskMembers.length})
      </button>
    </div>
     {/* Main Table (desktop) */}
      <style>{`
        .tw-cards { display: none; }
        @media (max-width: 768px) {
          .tw-table { display: none !important; }
          .tw-cards { display: block; }
        }
      `}</style>
      {!isMobile && (
      <div className="tw-table" style={{...styles.tableContainer, overflowX: "auto"}}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>Member Name</th>
              <th style={styles.th}>Week</th>
              <th style={styles.th}>InBody Scans</th>
              <th style={styles.th}>This Wk Visits</th>
              <th style={styles.th}>12-Week Attendance Matrix</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((member) => {
              const isAtRisk = filter === "at_risk" || !!member.atRiskSince;
              const isPending = member.status === "pending";
              const masterWeek = !isPending ? getMasterWeekVisits(member) : null;
              const thisWeekVisits = isPending ? 0 : (masterWeek != null ? masterWeek : (member.weeklyCheckIns?.[member.currentWeek] || 0));
              const risk = getMemberRiskInfo(thisWeekVisits, member.startDate, member.status);
              const scans = member.inBodyScans || { scan1: false, scan2: false, scan3: false };
              const scanCount = (scans.scan1 ? 1 : 0) + (scans.scan2 ? 1 : 0) + (scans.scan3 ? 1 : 0);

              return (
                <tr 
                  key={member.id} 
                  style={styles.clickableTableRow}
                 onClick={() => {
        if (isAtRisk) {
          setSelectedAtRiskMember(member);
        } else {
          handleOpenPersonView(member);
        }
      }}
    >
                  <td style={styles.td}>
                    <div style={styles.memberName}>{member.firstName} {member.lastName}</div>
                    
                  </td>

                 <td style={styles.td}>
        {isAtRisk ? (
          <span style={{
            backgroundColor: "#fef2f2",
            color: "#dc2626",
            padding: "3px 8px",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: "700"
          }}>
            ⚠️ {daysOutLive(member)} days out
          </span>
        ) : isPending ? (
          <span style={styles.badgePending}>⏳ Pending</span>
        ) : (
          <span style={styles.badgeWeek}>Week {getOnboardingWeekNumber(member.startDate) || member.currentWeek}</span>
        )}
      </td>

                  <td style={styles.td}>
                    <span style={scanCount === 3 ? styles.scanCompleteBadge : styles.scanPartialBadge}>
                      {scanCount} / 3 Scans
                    </span>
                  </td>

                  <td style={styles.td}>
                    {isPending ? (
                      <span style={{ fontSize: "12px", color: "#9ca3af", fontStyle: "italic" }}>Not started</span>
                    ) : (
                      <span style={{ backgroundColor: risk.bg, color: risk.color, padding: "3px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: "700" }}>
                        {thisWeekVisits} visits
                      </span>
                    )}
                  </td>

                  <td style={styles.td}>
                    {isPending ? (
                      <span style={styles.waitingText}>Waiting for 1st check-in to start journey</span>
                    ) : (
                      <div style={styles.matrixGrid}>
                        {[...Array(12)].map((_, i) => {
                          const weekNum = i + 1;
                          const count = getWeekVisitCount(member, weekNum);
                          const todayWeek = getOnboardingWeekNumber(member.startDate);
                          const isCurrent = weekNum === todayWeek;

                          let bg = "#e5e7eb";
                          let titleExtra = "";
                          if (isCurrent) {
                            // Pace-aware: 1 visit early in the week is still on track
                            const risk = getMemberRiskInfo(count, member.startDate, member.status);
                            if (risk.level === "low") bg = "#22c55e";
                            else if (risk.level === "medium") bg = "#f59e0b";
                            else if (risk.level === "high") bg = "#ef4444";
                            titleExtra = ` · ${risk.label}`;
                          } else if (count >= 3) bg = "#22c55e";
                          else if (count === 2) bg = "#f59e0b";
                          else if (count === 1) bg = "#ef4444";
                          else if (weekNum < todayWeek && count === 0) bg = "#9ca3af";

                          return (
                            <div 
                              key={weekNum} 
                              title={`Week ${weekNum}: ${count} visits${titleExtra}`}
                              style={{
                                ...styles.matrixBox,
                                backgroundColor: bg,
                                border: isCurrent ? "2px solid #000" : "1px solid #d1d5db"
                              }}
                            >
                              <span style={styles.matrixText}>{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>

                  <td style={{ ...styles.td, textAlign: "right" }}>
                    <span style={styles.arrowIcon}>→</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {isMobile && (
      <div className="tw-cards" style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", minWidth: 0 }}>
        {(filter === "high_risk" ? highRiskMembers : filteredMembers).map((member) => {
          const isAtRisk = filter === "at_risk" || !!member.atRiskSince;
          const isPending = member.status === "pending";
          const masterWeek = !isPending ? getMasterWeekVisits(member) : null;
          const thisWeekVisits = isPending ? 0 : (masterWeek != null ? masterWeek : (member.weeklyCheckIns?.[member.currentWeek] || 0));
          const risk = getMemberRiskInfo(thisWeekVisits, member.startDate, member.status);
          const scans = member.inBodyScans || { scan1: false, scan2: false, scan3: false };
          const scanCount = (scans.scan1 ? 1 : 0) + (scans.scan2 ? 1 : 0) + (scans.scan3 ? 1 : 0);
          const weekLabel = isPending ? "Pending" : `Week ${getOnboardingWeekNumber(member.startDate) || member.currentWeek}`;
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => isAtRisk ? setSelectedAtRiskMember(member) : handleOpenPersonView(member)}
              style={{
                textAlign: "left",
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "8px 10px",
                cursor: "pointer",
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                overflow: "hidden"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 14, minWidth: 0 }}>
                  {member.firstName} {member.lastName}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, fontSize: 11, color: "#64748b" }}>
                  <span style={{ fontWeight: 800, color: "#2563eb" }}>{weekLabel}</span>
                  {!isPending && (
                    <span style={{ fontWeight: 700, color: risk.color }}> · {thisWeekVisits} visits</span>
                  )}
                  <span> · {scanCount}/3</span>
                </div>
              </div>
              {!isPending && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 3, marginTop: 6 }}>
                  {[...Array(12)].map((_, i) => {
                    const weekNum = i + 1;
                    const count = getWeekVisitCount(member, weekNum);
                    const todayWeek = getOnboardingWeekNumber(member.startDate);
                    const isCurrent = weekNum === todayWeek;
                    let bg = "#e5e7eb";
                    if (isCurrent) {
                      const r = getMemberRiskInfo(count, member.startDate, member.status);
                      bg = r.level === "low" ? "#22c55e" : r.level === "medium" ? "#f59e0b" : "#ef4444";
                    } else if (count >= 3) bg = "#22c55e";
                    else if (count === 2) bg = "#f59e0b";
                    else if (count === 1) bg = "#ef4444";
                    else if (weekNum < todayWeek && count === 0) bg = "#9ca3af";
                    return (
                      <div key={weekNum} title={`Week ${weekNum}: ${count}`} style={{
                        height: 22, borderRadius: 4, background: bg, color: "#fff",
                        fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                        border: isCurrent ? "2px solid #0f172a" : "none"
                      }}>{count}</div>
                    );
                  })}
                </div>
              )}
            </button>
          );
        })}
      </div>
      )}

  </>
  );
}