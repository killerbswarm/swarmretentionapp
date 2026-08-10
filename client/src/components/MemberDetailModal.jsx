import React from "react";
import { stripHtml } from "../utils/helpers";

export default function MemberDetailModal(props) {
  const {
    selectedMember,
    personStats,
    memberCheckIns,
    loadingHistory,
    isEditing,
    setIsEditing,
    editFormData,
    setEditFormData,
    activeTab,
    setActiveTab,
    ghlData,
    loadingGhl,
    newNoteText,
    setNewNoteText,
    addingNote,
    newSmsText,
    setNewSmsText,
    sendingSms,
    checkInDatesSet,
    threeMonthCalendars,
    onClose,
    onManualCheckIn,
    onDeleteLog,
    onAddNote,
    onSendSms,
    onSaveEdit,
    onDeleteMember,
    onToggleScan,
  } = props;

  if (!selectedMember || !personStats) return null;

  const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.personViewModal} onClick={(e) => e.stopPropagation()}>
        
         {selectedMember && personStats && (
        <div style={styles.modalOverlay} onClick={() => onClose}>
          <div style={styles.personViewModal} onClick={(e) => e.stopPropagation()}>
            
            <div style={styles.personHeader}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h2 style={{ margin: 0, fontSize: "24px" }}>{selectedMember.firstName} {selectedMember.lastName}</h2>
                  <span style={{ backgroundColor: personStats.riskInfo.bg, color: personStats.riskInfo.color, padding: "4px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: "700" }}>
                    {personStats.riskInfo.label}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0 0", color: "#6b7280", fontSize: "14px" }}>
                  {selectedMember.email} • {selectedMember.phone || "No phone"}
                </p>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedMember(null)}>✕</button>
            </div>

            <div style={styles.progressCard}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                <span>12-Week Journey Progress ({personStats.onboardingProgressPct}%)</span>
                <span>{selectedMember.status === "pending" ? "Pending Start" : `Week ${selectedMember.currentWeek} of 12`}</span>
              </div>
              <div style={styles.progressBarTrack}>
                <div style={{ ...styles.progressBarFill, width: `${personStats.onboardingProgressPct}%` }} />
              </div>
            </div>

            {/* Person View Stats Row */}
            <div style={styles.personStatsRow}>
              <div style={styles.personStatBox}>
                <span style={styles.personStatLabel}>Next Week Starts</span>
                <span style={styles.personStatValue}>{personStats.nextWeekStartDateStr}</span>
                <span style={styles.personStatSubText}>
                  {selectedMember.status === "pending" 
                    ? "Pending 1st visit" 
                    : (personStats.activeWeeks >= 12 ? "12 Wks Completed" : `Week ${personStats.nextWeekNum} in ${personStats.daysUntilNextWeek} days`)}
                </span>
              </div>
              <div style={styles.personStatBox}>
                <span style={styles.personStatLabel}>Total Check-Ins</span>
                <span style={styles.personStatValue}>{personStats.totalAllTimeVisits} visits</span>
                <span style={styles.personStatSubText}>Across all weeks</span>
              </div>
              <div style={styles.personStatBox}>
                <span style={styles.personStatLabel}>Avg Weekly Pace</span>
                <span style={styles.personStatValue}>{personStats.avgWeeklyVisitsPerson} / wk</span>
                <span style={styles.personStatSubText}>Proj. {personStats.projected12WkTotal} visits total</span>
              </div>
              <div style={styles.personStatBox}>
                <span style={styles.personStatLabel}>Time Active</span>
                <span style={styles.personStatValue}>{personStats.daysActive} days</span>
                <span style={styles.personStatSubText}>Since 1st Check-In</span>
              </div>
            </div>

            {/* 3-Month Calendar */}
            <div style={styles.sectionCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", textTransform: "uppercase", color: "#374151" }}>
                  3-Month Onboarding Attendance Calendar
                </h4>
                <div style={{ display: "flex", gap: "12px", fontSize: "11px", fontWeight: "600", color: "#64748b" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "10px", height: "10px", backgroundColor: "#2563eb", borderRadius: "2px", display: "inline-block" }}></span> Week Start (W1-W12)
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "10px", height: "10px", backgroundColor: "#22c55e", borderRadius: "2px", display: "inline-block" }}></span> Visit Day
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "10px", height: "10px", backgroundColor: "#fff", border: "2px solid #2563eb", borderRadius: "2px", display: "inline-block" }}></span> Today
                  </span>
                </div>
              </div>

              {selectedMember.status === "pending" || !selectedMember.startDate ? (
                <div style={{ padding: "16px", backgroundColor: "#eff6ff", borderRadius: "8px", border: "1px solid #bfdbfe", textAlign: "center", color: "#1d4ed8", fontSize: "13px" }}>
                  ⏳ Calendar view will automatically populate here once the member completes their first check-in class.
                </div>
              ) : (
                <div style={styles.calendarGridContainer}>
                  {threeMonthCalendars.map((mObj, mIdx) => (
                    <div key={mIdx} style={styles.calendarMonthCard}>
                      <div style={styles.calendarMonthTitle}>{mObj.monthName}</div>
                      
                      <div style={styles.calendarHeaderRow}>
                        {["S", "M", "T", "W", "T", "F", "S"].map((dayName, dIdx) => (
                          <div key={dIdx} style={styles.calendarHeaderCell}>{dayName}</div>
                        ))}
                      </div>

                      <div style={styles.calendarDaysGrid}>
                        {[...Array(mObj.firstDayOfWeek)].map((_, emptyIdx) => (
                          <div key={`empty-${emptyIdx}`} style={styles.calendarDayEmpty} />
                        ))}

                        {[...Array(mObj.daysInMonth)].map((_, dayIdx) => {
                          const dayNum = dayIdx + 1;
                          const dateKey = `${mObj.year}-${String(mObj.month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                          const hasVisit = checkInDatesSet.has(dateKey);
                          const isToday = dateKey === todayKey;

                          let weekBadgeLabel = null;
                          if (selectedMember.startDate) {
                            const sObj = new Date(selectedMember.startDate);
                            const startLocal = new Date(sObj.getFullYear(), sObj.getMonth(), sObj.getDate());
                            const cellLocal = new Date(mObj.year, mObj.month, dayNum);
                            
                            const diffDays = Math.round((cellLocal - startLocal) / (1000 * 60 * 60 * 24));
                            if (diffDays >= 0 && diffDays < 84) {
                              if (diffDays % 7 === 0) {
                                const wNum = Math.floor(diffDays / 7) + 1;
                                weekBadgeLabel = `W${wNum}`;
                              }
                            }
                          }

                          let cellStyle = { ...styles.calendarDayCell };
                          if (hasVisit) cellStyle = { ...cellStyle, ...styles.calendarDayVisited };
                          if (isToday) cellStyle = { ...cellStyle, ...styles.calendarDayToday };

                          return (
                            <div key={dayNum} style={cellStyle} title={hasVisit ? `Visited on ${dateKey}` : dateKey}>
                              {weekBadgeLabel && (
                                <span style={styles.calendarWeekBadge}>{weekBadgeLabel}</span>
                              )}
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

            {/* InBody Scans */}
            <div style={styles.sectionCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", textTransform: "uppercase", color: "#374151" }}>
                  InBody Scans Checklist
                </h4>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#16a34a" }}>
                  {personStats.scansCompleted} / 3 Complete ({personStats.scanPct}%)
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

            {/* --- GHL & LOGS MULTI-TAB SECTION --- */}
            <div style={styles.sectionCard}>
              <div style={styles.tabHeaderBar}>
                <button 
                  style={activeTab === "logs" ? styles.tabBtnActive : styles.tabBtn}
                  onClick={() => setActiveTab("logs")}
                >
                  📜 Check-In Logs ({memberCheckIns.length})
                </button>
                <button 
                  style={activeTab === "messages" ? styles.tabBtnActive : styles.tabBtn}
                  onClick={() => setActiveTab("messages")}
                >
                  💬 GHL SMS History ({ghlData.messages.length})
                </button>
                <button 
                  style={activeTab === "notes" ? styles.tabBtnActive : styles.tabBtn}
                  onClick={() => setActiveTab("notes")}
                >
                  📝 GHL Staff Notes ({ghlData.notes.length})
                </button>
                <button 
                  style={activeTab === "appts" ? styles.tabBtnActive : styles.tabBtn}
                  onClick={() => setActiveTab("appts")}
                >
                  📅 GHL Appointments ({ghlData.appointments.length})
                </button>
              </div>

              {/* TAB 1: CHECK-IN LOGS */}
              {activeTab === "logs" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>Raw attendance entries from GHL webhooks & manual logs</span>
                    {selectedMember.status === "active" && (
                      <button style={styles.manualCheckInBtn} onClick={onManualCheckIn}>
                        + Quick Log Check-In
                      </button>
                    )}
                  </div>

                  {loadingHistory ? (
                    <p style={{ color: "#6b7280", fontSize: "13px" }}>Loading logs...</p>
                  ) : memberCheckIns.length === 0 ? (
                    <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "13px" }}>
                      No check-ins logged yet.
                    </p>
                  ) : (
                    <div style={styles.historyLogList}>
                      {memberCheckIns.map((log) => (
                        <div key={log.id} style={styles.historyLogItem}>
                          <div>
                            <div style={{ fontWeight: "600", fontSize: "13px" }}>
                              {new Date(log.timestamp).toLocaleString("en-US", {
                                weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
                              })}
                            </div>
                            <div style={{ fontSize: "11px", color: "#64748b" }}>{log.source || "GHL Webhook"}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={styles.weekPill}>Week {log.weekNumber || 1}</span>
                            <button 
                              style={styles.deleteLogBtn}
                              onClick={() => onDeleteLog(log)}
                              title="Delete this check-in entry"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: LIVE GHL MESSAGES & 2-WAY SMS SENDING */}
              {activeTab === "messages" && (
                <div>
                  {loadingGhl ? (
                    <p style={{ fontSize: "13px", color: "#64748b" }}>Loading SMS conversation thread from GoHighLevel...</p>
                  ) : ghlData.messages.length === 0 ? (
                    <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "13px" }}>No SMS conversation history found in GHL for this email.</p>
                  ) : (
                    <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column-reverse", gap: "8px", paddingRight: "4px", marginBottom: "12px" }}>
                      {ghlData.messages.map((msg) => {
                        const isOutbound = msg.direction === "outbound";
                        return (
                          <div 
                            key={msg.id || Math.random()} 
                            style={{
                              alignSelf: isOutbound ? "flex-end" : "flex-start",
                              backgroundColor: isOutbound ? "#2563eb" : "#f1f5f9",
                              color: isOutbound ? "#ffffff" : "#0f172a",
                              padding: "8px 12px",
                              borderRadius: "10px",
                              maxWidth: "80%",
                              fontSize: "12px",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                            }}
                          >
                            <div style={{ whiteSpace: "pre-wrap" }}>{msg.body}</div>
                            <div style={{ fontSize: "9px", opacity: 0.7, marginTop: "4px", textAlign: "right" }}>
                              {new Date(msg.dateAdded || msg.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* SMS Input Box */}
                  {ghlData.contactId ? (
                    <form onSubmit={onSendSms} style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      <input 
                        type="text"
                        placeholder="Type text message to send via GHL..."
                        value={newSmsText}
                        onChange={(e) => setNewSmsText(e.target.value)}
                        style={{ ...styles.input, flex: 1 }}
                      />
                      <button 
                        type="submit" 
                        disabled={sendingSms || !newSmsText.trim()}
                        style={{ ...styles.addBtn, opacity: sendingSms || !newSmsText.trim() ? 0.6 : 1 }}
                      >
                        {sendingSms ? "Sending..." : "Send Text 📤"}
                      </button>
                    </form>
                  ) : (
                    <p style={{ fontSize: "11px", color: "#ef4444" }}>Cannot send SMS: GHL Contact ID not resolved.</p>
                  )}
                </div>
              )}

              {/* TAB 3: GHL STAFF NOTES & CREATE NOTE */}
              {activeTab === "notes" && (
                <div>
                  {/* Create Note Input Box */}
                  {ghlData.contactId && (
                    <form onSubmit={onAddNote} style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                      <input 
                        type="text"
                        placeholder="Add a new coaching / staff note to GHL..."
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        style={{ ...styles.input, flex: 1 }}
                      />
                      <button 
                        type="submit" 
                        disabled={addingNote || !newNoteText.trim()}
                        style={{ ...styles.manualCheckInBtn, opacity: addingNote || !newNoteText.trim() ? 0.6 : 1 }}
                      >
                        {addingNote ? "Adding..." : "+ Add Staff Note"}
                      </button>
                    </form>
                  )}

                  {loadingGhl ? (
                    <p style={{ fontSize: "13px", color: "#64748b" }}>Loading staff notes from GoHighLevel...</p>
                  ) : ghlData.notes.length === 0 ? (
                    <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "13px" }}>No coaching/staff notes recorded in GHL.</p>
                  ) : (
                    <div style={{ maxHeight: "180px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                      {ghlData.notes.map((note) => (
                        <div key={note.id} style={{ padding: "12px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                          <div style={{ fontSize: "13px", color: "#0f172a", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>
                            {stripHtml(note.body)}
                          </div>
                          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "6px", fontWeight: "600" }}>
                            Added on {new Date(note.dateAdded || note.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: GHL APPOINTMENTS */}
              {activeTab === "appts" && (
                <div>
                  {loadingGhl ? (
                    <p style={{ fontSize: "13px", color: "#64748b" }}>Loading booked calendar appointments from GoHighLevel...</p>
                  ) : ghlData.appointments.length === 0 ? (
                    <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "13px" }}>No calendar appointments found in GHL.</p>
                  ) : (
                    <div style={{ maxHeight: "220px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                      {ghlData.appointments.map((appt) => (
                        <div key={appt.id} style={{ padding: "10px 12px", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: "700", fontSize: "13px", color: "#1e40af" }}>{appt.title || appt.name || appt.calendarName || "Coaching / Review Session"}</div>
                            <div style={{ fontSize: "11px", color: "#3b82f6", marginTop: "2px" }}>
                              {new Date(appt.startTime || appt.start || appt.dateAdded).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </div>
                          </div>
                          <span style={{ backgroundColor: (appt.appointmentStatus === "confirmed" || appt.status === "confirmed") ? "#dcfce7" : "#fef3c7", color: (appt.appointmentStatus === "confirmed" || appt.status === "confirmed") ? "#15803d" : "#d97706", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", textTransform: "capitalize" }}>
                            {appt.appointmentStatus || appt.status || "Booked"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Edit Settings */}
            <div style={styles.sectionCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", textTransform: "uppercase", color: "#374151" }}>
                  Member Settings & Manual Adjustments
                </h4>
                <button 
                  style={styles.secondaryBtn} 
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? "Cancel Edit" : "Edit Settings & Check-Ins"}
                </button>
              </div>

              {isEditing ? (
                <form onSubmit={onSaveEdit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={styles.formGrid}>
                    <div>
                      <label style={styles.label}>First Name</label>
                      <input 
                        style={styles.input}
                        type="text" 
                        value={editFormData.firstName || ""} 
                        onChange={e => setEditFormData({...editFormData, firstName: e.target.value})}
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Last Name</label>
                      <input 
                        style={styles.input}
                        type="text" 
                        value={editFormData.lastName || ""} 
                        onChange={e => setEditFormData({...editFormData, lastName: e.target.value})}
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Email</label>
                      <input 
                        style={styles.input}
                        type="email" 
                        value={editFormData.email || ""} 
                        onChange={e => setEditFormData({...editFormData, email: e.target.value})}
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Phone</label>
                      <input 
                        style={styles.input}
                        type="text" 
                        value={editFormData.phone || ""} 
                        onChange={e => setEditFormData({...editFormData, phone: e.target.value})}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Date Added (App Signup)</label>
                      <input 
                        style={styles.input}
                        type="date" 
                        value={editFormData.dateAddedFormatted || ""} 
                        onChange={e => setEditFormData({...editFormData, dateAddedFormatted: e.target.value})}
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Start Date (1st Check-In)</label>
                      <input 
                        style={styles.input}
                        type="date" 
                        value={editFormData.startDateFormatted || ""} 
                        onChange={e => setEditFormData({...editFormData, startDateFormatted: e.target.value})}
                      />
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <label style={styles.label}>Status</label>
                      <select 
                        style={styles.input}
                        value={editFormData.status || "pending"}
                        onChange={e => setEditFormData({...editFormData, status: e.target.value})}
                      >
                        <option value="pending">⏳ Pending (Waiting for 1st check-in)</option>
                        <option value="active">🔥 Active Onboarding</option>
                        <option value="graduated">Graduated (Completed 12 Wks)</option>
                        <option value="cancelled">Cancelled / Quit</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ backgroundColor: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <label style={{ ...styles.label, display: "block", marginBottom: "8px" }}>
                      Adjust Weekly Check-In Counts (Weeks 1 to 12)
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px" }}>
                      {[...Array(12)].map((_, i) => {
                        const wNum = i + 1;
                        return (
                          <div key={wNum} style={{ textAlign: "center" }}>
                            <span style={{ fontSize: "10px", fontWeight: "700", color: "#64748b" }}>Wk {wNum}</span>
                            <input 
                              type="number"
                              min="0"
                              style={{ width: "100%", padding: "4px", borderRadius: "4px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}
                              value={editFormData.weeklyCheckIns?.[wNum] ?? 0}
                              onChange={e => {
                                const val = parseInt(e.target.value, 10) || 0;
                                setEditFormData({
                                  ...editFormData,
                                  weeklyCheckIns: {
                                    ...(editFormData.weeklyCheckIns || {}),
                                    [wNum]: val
                                  }
                                });
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
                    <button type="submit" style={styles.saveBtn}>Save All Settings & Check-Ins</button>
                  </div>
                </form>
              ) : (
                <div style={{ fontSize: "13px", color: "#6b7280" }}>
                  Status: <strong>{selectedMember.status}</strong> • Current Onboarding Week: <strong>Week {selectedMember.currentWeek}</strong>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "1px solid #e5e7eb" }}>
              <span style={{ fontSize: "12px", color: "#9ca3af" }}>Member ID: {selectedMember.id}</span>
              <button 
                style={styles.deleteBtn}
                onClick={() => onDeleteMember(selectedMember.id)}
              >
                Delete Member
              </button>
            </div>

          </div>
        </div>
      )}

      </div>
    </div>
  );
}

// You can copy the relevant styles from App.jsx later
const styles = {
  // Person View Modal Styles
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15, 23, 42, 0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 },
  personViewModal: { backgroundColor: "#fff", borderRadius: "12px", width: "720px", maxWidth: "95%", maxHeight: "90vh", overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" },
  personHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "12px", borderBottom: "1px solid #e2e8f0" },
  closeBtn: { background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#64748b" },
  progressCard: { backgroundColor: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0" },
  progressBarTrack: { backgroundColor: "#e2e8f0", height: "8px", borderRadius: "4px", overflow: "hidden" },
  progressBarFill: { backgroundColor: "#2563eb", height: "100%", borderRadius: "4px", transition: "width 0.3s ease" },
  personStatsRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" },
  personStatBox: { backgroundColor: "#f8fafc", padding: "10px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column" },
  personStatLabel: { fontSize: "10px", color: "#64748b", textTransform: "uppercase", fontWeight: "700" },
  personStatValue: { fontSize: "15px", fontWeight: "800", color: "#0f172a", marginTop: "2px" },
  personStatSubText: { fontSize: "10px", color: "#94a3b8", marginTop: "2px" },
  sectionCard: { backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" },
  
  // Calendar Styles
  calendarGridContainer: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" },
  calendarMonthCard: { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px" },
  calendarMonthTitle: { fontSize: "12px", fontWeight: "700", color: "#0f172a", marginBottom: "8px", textAlign: "center" },
  calendarHeaderRow: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" },
  calendarHeaderCell: { fontSize: "9px", fontWeight: "700", color: "#64748b", textAlign: "center" },
  calendarDaysGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" },
  calendarDayEmpty: { height: "26px" },
  calendarDayCell: { position: "relative", height: "26px", borderRadius: "3px", backgroundColor: "#fff", border: "1px solid #e2e8f0", fontSize: "10px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#475569" },
  calendarDayVisited: { backgroundColor: "#22c55e", color: "#fff", fontWeight: "bold", border: "none" },
  calendarDayToday: { border: "2px solid #2563eb", fontWeight: "bold" },
  calendarWeekBadge: { position: "absolute", top: "1px", left: "2px", fontSize: "7px", fontWeight: "800", color: "#2563eb", backgroundColor: "#eff6ff", borderRadius: "2px", padding: "0 2px" },

  // Tabs System Styles
  tabHeaderBar: { display: "flex", gap: "6px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px", marginBottom: "12px", overflowX: "auto" },
  tabBtn: { padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", backgroundColor: "#f8fafc", color: "#475569", fontSize: "12px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" },
  tabBtnActive: { padding: "6px 12px", borderRadius: "6px", border: "none", backgroundColor: "#2563eb", color: "#ffffff", fontSize: "12px", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" },

  scanBoxDone: { flex: 1, backgroundColor: "#dcfce7", color: "#15803d", border: "1px solid #86efac", padding: "10px", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontWeight: "600", fontSize: "13px" },
  scanBoxPending: { flex: 1, backgroundColor: "#f8fafc", color: "#64748b", border: "1px solid #cbd5e1", padding: "10px", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontWeight: "500", fontSize: "13px" },
  historyLogList: { maxHeight: "180px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" },
  historyLogItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", backgroundColor: "#f8fafc", borderRadius: "6px", border: "1px solid #f1f5f9" },
  weekPill: { backgroundColor: "#e0e7ff", color: "#3730a3", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "700" },
  deleteLogBtn: { background: "none", border: "none", cursor: "pointer", fontSize: "14px", padding: "2px 4px", opacity: 0.8 },
  manualCheckInBtn: { backgroundColor: "#16a34a", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer" },
  secondaryBtn: { backgroundColor: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" },
  deleteBtn: { backgroundColor: "#ef4444", color: "#fff", border: "none", padding: "8px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  form: { display: "flex", flexDirection: "column", gap: "10px" },
  label: { fontSize: "11px", fontWeight: "600", color: "#475569" },
  input: { padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box" },
  modalContent: { backgroundColor: "#fff", padding: "24px", borderRadius: "12px", width: "420px", maxWidth: "90%" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" },
  saveBtn: { padding: "8px 16px", borderRadius: "6px", backgroundColor: "#2563eb", color: "#fff", border: "none", cursor: "pointer", fontWeight: "600" },
  cancelBtn: { padding: "8px 16px", borderRadius: "6px", backgroundColor: "#e2e8f0", color: "#334155", border: "none", cursor: "pointer" }

};
 