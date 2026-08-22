import React from "react";
import ProgressBar from "./MemberDetail/ProgressBar";
import StatsRow from "./MemberDetail/StatsRow";
import MemberHeader from "./MemberDetail/MemberHeader";
import MemberTabs from "./MemberDetail/MemberTabs";

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
    onMessagesChange,
    onSaveEdit,
    onDeleteMember,
    onToggleScan,
    smsFile,
    setSmsFile,
    smsFilePreview,
    setSmsFilePreview,
    sendAsInternal,
    setSendAsInternal,
  } = props;

  if (!selectedMember || !personStats) return null;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.personViewModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ flexShrink: 0 }}>
          <MemberHeader
            selectedMember={selectedMember}
            riskInfo={personStats.riskInfo}
            onClose={onClose}
          />
          <ProgressBar
            progressPct={personStats.onboardingProgressPct}
            status={selectedMember.status}
            currentWeek={personStats.activeWeeks || selectedMember.currentWeek}
          />
          <StatsRow
            personStats={personStats}
            status={selectedMember.status}
          />
        </div>

        <MemberTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          selectedMember={selectedMember}
          memberCheckIns={memberCheckIns}
          threeMonthCalendars={threeMonthCalendars}
          checkInDatesSet={checkInDatesSet}
          scansCompleted={personStats.scansCompleted}
          scanPct={personStats.scanPct}
          onToggleScan={onToggleScan}
          loadingHistory={loadingHistory}
          ghlData={ghlData}
          loadingGhl={loadingGhl}
          newNoteText={newNoteText}
          setNewNoteText={setNewNoteText}
          addingNote={addingNote}
          newSmsText={newSmsText}
          setNewSmsText={setNewSmsText}
          sendingSms={sendingSms}
          onManualCheckIn={onManualCheckIn}
          onDeleteLog={onDeleteLog}
          onAddNote={onAddNote}
          onSendSms={onSendSms}
          onMessagesChange={onMessagesChange}
          smsFile={smsFile}
          setSmsFile={setSmsFile}
          smsFilePreview={smsFilePreview}
          setSmsFilePreview={setSmsFilePreview}
          sendAsInternal={sendAsInternal}
          setSendAsInternal={setSendAsInternal}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          editFormData={editFormData}
          setEditFormData={setEditFormData}
          onSaveEdit={onSaveEdit}
          onDeleteMember={onDeleteMember}
        />
      </div>
    </div>
  );
}

// You can copy the relevant styles from App.jsx later
const styles = {
  // Person View Modal Styles
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15, 23, 42, 0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 },
  personViewModal: {
    backgroundColor: "#fff",
    borderRadius: "16px",
    width: "100%",
    maxWidth: "960px",
    height: "94vh",
    maxHeight: "94vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.4)",
    padding: "16px",
  },
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
 