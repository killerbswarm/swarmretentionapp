import React from "react";
import { stripHtml } from "../../utils/helpers";

export default function MemberTabs({
  activeTab,
  setActiveTab,
  selectedMember,
  memberCheckIns,
  loadingHistory,
  ghlData,
  loadingGhl,
  newNoteText,
  setNewNoteText,
  addingNote,
  newSmsText,
  setNewSmsText,
  sendingSms,
  onManualCheckIn,
  onDeleteLog,
  onAddNote,
  onSendSms,
  smsFile,
  setSmsFile,
  smsFilePreview,
  setSmsFilePreview,
  sendAsInternal,
  setSendAsInternal,
}) {
  return (
    <div style={styles.sectionCard}>
      {/* Tab Buttons */}
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
          💬 GHL SMS  ({ghlData.messages.length})
        </button>
        <button
          style={activeTab === "notes" ? styles.tabBtnActive : styles.tabBtn}
          onClick={() => setActiveTab("notes")}
        >
          📝 GHL Notes ({ghlData.notes.length})
        </button>
        <button
          style={activeTab === "appts" ? styles.tabBtnActive : styles.tabBtn}
          onClick={() => setActiveTab("appts")}
        >
          📅 GHL Appointments ({ghlData.appointments.length})
        </button>
      </div>

      {/* ===== TAB 1: CHECK-IN LOGS ===== */}
      {activeTab === "logs" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Raw attendance entries from GHL webhooks & manual logs
            </span>
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
              <button
  onClick={onManualCheckIn}
  style={{
    backgroundColor: "#16a34a",
    color: "#fff",
    border: "none",
    padding: "10px 16px",
    borderRadius: "8px",
    fontWeight: "600",
    cursor: "pointer",
    marginTop: "12px",
  }}
>
  {selectedMember?.status === "pending"
    ? "✓ Log First Check-In (Start 12-Week)"
    : "+ Add Manual Check-In"}
</button>
            </p>
            
          ) : (
            <div style={styles.historyLogList}>
              {memberCheckIns.map((log) => (
                <div key={log.id} style={styles.historyLogItem}>
                  <div>
                    <div style={{ fontWeight: "600", fontSize: "13px" }}>
                      {log.timestamp
                        ? new Date(log.timestamp).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "Unknown date"}
                    </div>
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

      {/* ===== TAB 2: SMS ===== */}
      {activeTab === "messages" && (
        <div>
          {loadingGhl ? (
            <p style={{ fontSize: "13px", color: "#64748b" }}>
              Loading SMS conversation thread from GoHighLevel...
            </p>
          ) : ghlData.messages.length === 0 ? (
            <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "13px" }}>
              No SMS conversation history found in GHL for this email.
            </p>
          ) : (
            <div
              style={{
                maxHeight: "420px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column-reverse",
                gap: "8px",
                paddingRight: "4px",
                marginBottom: "12px",
              }}
            >
              {ghlData.messages.map((msg) => {
  const isInternal =
    msg.messageType === "TYPE_INTERNAL_COMMENT" || msg.type === 37;

  if (isInternal) {
    return (
      <div
        key={msg.id}
        style={{
          alignSelf: "center",
          backgroundColor: "#fef9c3",
          border: "1px solid #fde047",
          color: "#713f12",
          padding: "8px 12px",
          borderRadius: "8px",
          maxWidth: "90%",
          fontSize: "13px",
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
          📝 Internal Comment
        </div>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {msg.body || msg.bodyText || ""}
        </div>
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, textAlign: "right" }}>
          {new Date(msg.dateAdded || msg.date).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      </div>
    );
  }
  const isOutbound = msg.direction === "outbound";
  const attachments = msg.attachments || msg.meta?.attachments || [];

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
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      {/* Text */}
      {msg.body && (
        <div style={{ whiteSpace: "pre-wrap" }}>{msg.body}</div>
      )}

      {/* Photos / Attachments */}
      {attachments.length > 0 && (
        <div style={{ marginTop: msg.body ? "8px" : "0", display: "flex", flexDirection: "column", gap: "6px" }}>
          {attachments.map((url, idx) => (
            <img
              key={idx}
              src={typeof url === "string" ? url : url.url || url}
              alt="Attachment"
              style={{
                maxWidth: "100%",
                borderRadius: "6px",
                cursor: "pointer",
              }}
              onClick={() => window.open(typeof url === "string" ? url : url.url || url, "_blank")}
            />
          ))}
        </div>
      )}

      <div
        style={{
          fontSize: "9px",
          opacity: 0.7,
          marginTop: "4px",
          textAlign: "right",
        }}
      >
        {new Date(msg.dateAdded || msg.date).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
})}
            </div>
          )}

          {/* SMS Input */}
{ghlData.contactId && (
  <form
    onSubmit={onSendSms}
    style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}
  >
    <textarea
      placeholder="Type text message to send via GHL..."
      value={newSmsText}
      onChange={(e) => setNewSmsText(e.target.value)}
      rows={3}
      style={{ 
        ...styles.input, 
        width: "100%",
        resize: "vertical",
        minHeight: "70px",
        fontFamily: "inherit"
      }}
    />

    {/* Photo preview */}
    {smsFilePreview && (
      <div style={{ position: "relative", display: "inline-block", maxWidth: "200px" }}>
        <img 
          src={smsFilePreview} 
          alt="Preview" 
          style={{ 
            width: "100%", 
            borderRadius: "8px", 
            border: "1px solid #e2e8f0" 
          }} 
        />
        <button
          type="button"
          onClick={() => {
            setSmsFile(null);
            setSmsFilePreview(null);
          }}
          style={{
            position: "absolute",
            top: "4px",
            right: "4px",
            background: "rgba(0,0,0,0.6)",
            color: "white",
            border: "none",
            borderRadius: "50%",
            width: "24px",
            height: "24px",
            cursor: "pointer",
            fontSize: "14px"
          }}
        >
          ×
        </button>
      </div>
    )}

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      {/* File picker */}
      <label style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px",
        backgroundColor: "#f1f5f9",
        border: "1px solid #cbd5e1",
        borderRadius: "6px",
        fontSize: "13px",
        cursor: "pointer",
        color: "#334155"
      }}>
        📷 Add Photo
        <input
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setSmsFile(file);
              setSmsFilePreview(URL.createObjectURL(file));
            }
          }}
        />
      </label>
      <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
    <input
      type="checkbox"
      checked={sendAsInternal}
      onChange={(e) => setSendAsInternal(e.target.checked)}
    />
    Internal comment (not sent to member)
  </label>
      <button
        type="submit"
        disabled={sendingSms || (!newSmsText.trim() && !smsFile)}
        style={{
          ...styles.manualCheckInBtn,
          opacity: sendingSms || (!newSmsText.trim() && !smsFile) ? 0.6 : 1,
        }}
      >
        {sendingSms ? "Sending..." : "Send SMS"}
      </button>
    </div>
  </form>
)}
        </div>
      )}

      {/* ===== TAB 3: NOTES ===== */}
      {activeTab === "notes" && (
        <div>
          {loadingGhl ? (
            <p style={{ fontSize: "13px", color: "#64748b" }}>Loading staff notes...</p>
          ) : ghlData.notes.length === 0 ? (
            <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "13px" }}>
              No staff notes found in GHL.
            </p>
          ) : (
            <div style={{ maxHeight: "220px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
              {ghlData.notes.map((note) => (
                <div
                  key={note.id || Math.random()}
                  style={{
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    fontSize: "13px",
                  }}
                >
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {stripHtml(note.body || note.note || "")}
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px" }}>
                    {new Date(note.dateAdded || note.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Note */}
          {ghlData.contactId && (
            <form onSubmit={onAddNote} style={{ marginTop: "12px" }}>
              <textarea
                placeholder="Add a staff note..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                rows={3}
                style={{ ...styles.input, width: "100%", resize: "vertical" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                <button
                  type="submit"
                  disabled={addingNote || !newNoteText.trim()}
                  style={{
                    ...styles.manualCheckInBtn,
                    opacity: addingNote || !newNoteText.trim() ? 0.6 : 1,
                  }}
                >
                  {addingNote ? "Adding..." : "Add Note"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ===== TAB 4: APPOINTMENTS ===== */}
      {activeTab === "appts" && (
        <div>
          {loadingGhl ? (
            <p style={{ fontSize: "13px", color: "#64748b" }}>Loading appointments...</p>
          ) : ghlData.appointments.length === 0 ? (
            <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "13px" }}>
              No appointments found in GHL for this contact.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {ghlData.appointments.map((appt) => (
                <div
                  key={appt.id || Math.random()}
                  style={{
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    fontSize: "13px",
                  }}
                >
                  <div style={{ fontWeight: "600" }}>{appt.title || "Appointment"}</div>
                  <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px" }}>
                    {new Date(appt.startTime || appt.start).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
  tabHeaderBar: {
    display: "flex",
    gap: "6px",
    marginBottom: "14px",
    flexWrap: "wrap",
  },
  tabBtn: {
    padding: "6px 12px",
    fontSize: "12px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    backgroundColor: "#f8fafc",
    color: "#475569",
    cursor: "pointer",
  },
  tabBtnActive: {
    padding: "6px 12px",
    fontSize: "12px",
    borderRadius: "6px",
    border: "1px solid #2563eb",
    backgroundColor: "#eff6ff",
    color: "#1d4ed8",
    fontWeight: "600",
    cursor: "pointer",
  },
  manualCheckInBtn: {
    backgroundColor: "#16a34a",
    color: "#fff",
    border: "none",
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  historyLogList: {
    maxHeight: "180px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  historyLogItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    backgroundColor: "#f8fafc",
    borderRadius: "6px",
    border: "1px solid #f1f5f9",
  },
  weekPill: {
    backgroundColor: "#e0e7ff",
    color: "#3730a3",
    padding: "2px 8px",
    borderRadius: "10px",
    fontSize: "11px",
    fontWeight: "700",
  },
  deleteLogBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
    padding: "2px 4px",
    opacity: 0.8,
  },
  input: {
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
  },
};