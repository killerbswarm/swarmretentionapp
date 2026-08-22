import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../../firebase";
import { stripHtml } from "../../utils/helpers";
import AttendanceCalendar from "./AttendanceCalendar";
import InBodyScans from "./InBodyScans";
import EditMemberForm from "./EditMemberForm";
import MemberFooter from "./MemberFooter";

export default function MemberTabs({
  activeTab,
  setActiveTab,
  selectedMember,
  memberCheckIns,
  threeMonthCalendars,
  checkInDatesSet,
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
  onMessagesChange,
  weekStartDay = 0,
  smsFile,
  setSmsFile,
  smsFilePreview,
  setSmsFilePreview,
  sendAsInternal,
  setSendAsInternal,
  scansCompleted,
  scanPct,
  onToggleScan,
  isEditing,
  setIsEditing,
  editFormData,
  setEditFormData,
  onSaveEdit,
  onDeleteMember,
}) {
  const [scheduleAt, setScheduleAt] = useState("");
  const [toast, setToast] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3200);
  };

  const formatMsgTime = (dateVal) => {
    if (!dateVal) return "";
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  // Merge pending scheduled SMS from Firestore
  useEffect(() => {
    const contactId = ghlData?.contactId;
    if (!contactId || activeTab !== "messages") return undefined;
    let cancelled = false;
    (async () => {
      try {
        const q = query(
          collection(db, "scheduled_sms"),
          where("contactId", "==", String(contactId)),
          where("status", "==", "scheduled")
        );
        const snap = await getDocs(q);
        if (cancelled || !snap.size) return;
        const pending = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: data.messageId || d.id,
            firestoreId: d.id,
            body: data.body || data.message || "",
            direction: "outbound",
            dateAdded: data.scheduledFor,
            scheduledFor: data.scheduledFor,
            status: "scheduled",
          };
        });
        if (typeof onMessagesChange === "function") {
          const existing = ghlData.messages || [];
          const ids = new Set(existing.map((m) => m.id).filter(Boolean));
          const keys = new Set(
            existing
              .filter((m) => m.status === "scheduled")
              .map((m) => `${m.body}|${m.scheduledFor}`)
          );
          const toAdd = pending.filter((p) => {
            if (p.id && ids.has(p.id)) return false;
            if (keys.has(`${p.body}|${p.scheduledFor}`)) return false;
            // drop past schedules
            if (p.scheduledFor && new Date(p.scheduledFor).getTime() <= Date.now()) return false;
            return true;
          });
          if (toAdd.length) onMessagesChange([...toAdd, ...existing]);
        }
      } catch (err) {
        console.warn("scheduled_sms load", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ghlData?.contactId, activeTab]);

  // Flip scheduled → sent when time passes
  useEffect(() => {
    const msgs = ghlData?.messages || [];
    const pending = msgs.filter(
      (m) =>
        (m.status === "scheduled" || m.scheduledFor) &&
        m.scheduledFor &&
        new Date(m.scheduledFor).getTime() > Date.now()
    );
    if (!pending.length || typeof onMessagesChange !== "function") return undefined;
    const timers = pending.map((m) => {
      const delay = Math.max(new Date(m.scheduledFor).getTime() - Date.now() + 1500, 1000);
      return setTimeout(() => {
        onMessagesChange(
          (ghlData.messages || []).map((row) => {
            if (row.id !== m.id && row.scheduledFor !== m.scheduledFor) return row;
            return {
              ...row,
              status: "sent",
              scheduledFor: null,
              dateAdded: row.scheduledFor || row.dateAdded,
            };
          })
        );
      }, delay);
    });
    return () => timers.forEach(clearTimeout);
  }, [ghlData?.messages]);

  const requestCancelScheduled = (messageId) => {
    if (!messageId) {
      showToast("Missing message id — cancel in GHL if needed");
      return;
    }
    setConfirmCancel(messageId);
  };

  const confirmCancelScheduled = async () => {
    const messageId = confirmCancel;
    if (!messageId) return;
    setConfirmCancel(null);
    try {
      const res = await fetch(
        "https://us-central1-swarm-12-week-startup.cloudfunctions.net/cancelScheduledGhlSms",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId }),
        }
      );
      const data = await res.json().catch(() => ({}));
      const errText = String(data.error || data.message || "");
      const alreadyGone =
        !res.ok &&
        (/not found|does not exist|404|no longer|already|invalid/i.test(errText) ||
          res.status === 404);

      if (!res.ok && !alreadyGone && data.error) {
        showToast(errText || "Cancel failed");
        return;
      }

      const row = (ghlData.messages || []).find(
        (m) => m.id === messageId || m.messageId === messageId
      );
      if (row?.firestoreId) {
        try {
          await deleteDoc(doc(db, "scheduled_sms", row.firestoreId));
        } catch (err) {
          console.warn(err);
        }
      } else {
        try {
          const q = query(
            collection(db, "scheduled_sms"),
            where("messageId", "==", String(messageId))
          );
          const snap = await getDocs(q);
          await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
        } catch (err) {
          console.warn(err);
        }
      }

      if (typeof onMessagesChange === "function") {
        onMessagesChange(
          (ghlData.messages || []).filter(
            (m) => m.id !== messageId && m.messageId !== messageId
          )
        );
      }
      showToast(alreadyGone ? "Already gone in GHL — cleared from app" : "Scheduled message canceled");
    } catch (e) {
      showToast(e.message || "Cancel failed");
    }
  };

  const handleSmsSubmit = (e) => {
    e.preventDefault();
    let scheduledTimestamp;
    if (scheduleAt) {
      const d = new Date(scheduleAt);
      if (isNaN(d.getTime())) {
        showToast("Invalid schedule time");
        return;
      }
      scheduledTimestamp = Math.floor(d.getTime() / 1000);
      if (scheduledTimestamp < Math.floor(Date.now() / 1000) + 90) {
        showToast("Pick a time at least 2 minutes from now");
        return;
      }
    }
    onSendSms(e, {
      scheduledAt: scheduleAt || undefined,
      scheduledTimestamp,
      onDone: (kind, err) => {
        if (kind === "error") showToast(err || "Send failed");
        else if (kind === "scheduled") {
          showToast(`Scheduled for ${formatMsgTime(scheduleAt)}`);
          setScheduleAt("");
        } else {
          showToast("Message sent");
          setScheduleAt("");
        }
      },
    });
  };

  return (
    <div style={styles.sectionCard}>
      {/* Tab Buttons */}
      <div style={styles.tabHeaderBar}>
        <button
          style={activeTab === "calendar" ? styles.tabBtnActive : styles.tabBtn}
          onClick={() => setActiveTab("calendar")}
        >
          Calendar
        </button>
        <button
          style={activeTab === "scans" ? styles.tabBtnActive : styles.tabBtn}
          onClick={() => setActiveTab("scans")}
        >
          Scans
        </button>
        <button
          style={activeTab === "messages" ? styles.tabBtnActive : styles.tabBtn}
          onClick={() => setActiveTab("messages")}
        >
          SMS
        </button>
        <button
          style={activeTab === "notes" ? styles.tabBtnActive : styles.tabBtn}
          onClick={() => setActiveTab("notes")}
        >
          Notes
        </button>
        <button
          style={activeTab === "appts" ? styles.tabBtnActive : styles.tabBtn}
          onClick={() => setActiveTab("appts")}
        >
          Appts
        </button>
        <button
          style={activeTab === "settings" ? styles.tabBtnActive : styles.tabBtn}
          onClick={() => setActiveTab("settings")}
        >
          Settings
        </button>
      </div>

      <div style={{
        ...styles.tabBody,
        overflowY: (activeTab === "calendar" || activeTab === "messages") ? "hidden" : "auto",
        display: (activeTab === "messages") ? "flex" : undefined,
        flexDirection: (activeTab === "messages") ? "column" : undefined,
      }}>
      {activeTab === "calendar" && (
        <AttendanceCalendar
          weekStartDay={weekStartDay}
          selectedMember={selectedMember}
          threeMonthCalendars={threeMonthCalendars}
          checkInDatesSet={checkInDatesSet}
          memberCheckIns={memberCheckIns}
          onAddCheckIn={onManualCheckIn}
          onDeleteLog={onDeleteLog}
        />
      )}

      {activeTab === "scans" && (
        <InBodyScans
          selectedMember={selectedMember}
          scansCompleted={scansCompleted}
          scanPct={scanPct}
          onToggleScan={onToggleScan}
        />
      )}

      {/* ===== TAB 2: SMS ===== */}
      {activeTab === "messages" && (
        <div style={styles.smsPanel}>
          {loadingGhl ? (
            <p style={{ fontSize: "13px", color: "#64748b" }}>
              Loading messages...
            </p>
          ) : ghlData.messages.length === 0 ? (
            <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "13px" }}>
              No SMS conversation found for this email.
            </p>
          ) : (
            <div style={styles.smsThread}>
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
  const scheduledForMs = msg.scheduledFor ? new Date(msg.scheduledFor).getTime() : 0;
  const isScheduled =
    scheduledForMs > Date.now() + 5000 &&
    (msg.status === "scheduled" || !!msg.scheduledFor);

  return (
    <div
      key={msg.id || Math.random()}
      style={{
        alignSelf: isOutbound || isScheduled ? "flex-end" : "flex-start",
        backgroundColor: isScheduled ? "#f59e0b" : isOutbound ? "#2563eb" : "#f1f5f9",
        color: isScheduled || isOutbound ? "#ffffff" : "#0f172a",
        padding: "8px 12px",
        borderRadius: "10px",
        maxWidth: "80%",
        fontSize: "12px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      {isScheduled && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4, fontSize: 10, fontWeight: 700 }}>
          <span>Scheduled</span>
          <span style={{ opacity: 0.9 }}>For {formatMsgTime(msg.scheduledFor)}</span>
        </div>
      )}
      {msg.body && (
        <div style={{ whiteSpace: "pre-wrap" }}>{msg.body}</div>
      )}
      {attachments.length > 0 && (
        <div style={{ marginTop: msg.body ? "8px" : "0", display: "flex", flexDirection: "column", gap: "6px" }}>
          {attachments.map((url, idx) => (
            <img
              key={idx}
              src={typeof url === "string" ? url : url.url || url}
              alt="Attachment"
              style={{ maxWidth: "100%", borderRadius: "6px", cursor: "pointer" }}
              onClick={() => window.open(typeof url === "string" ? url : url.url || url, "_blank")}
            />
          ))}
        </div>
      )}
      {isScheduled ? (
        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.95 }}>Queued — will send at this time</span>
          {(msg.id || msg.messageId) && (
            <button
              type="button"
              onClick={() => requestCancelScheduled(msg.id || msg.messageId)}
              style={{
                border: "1px solid rgba(255,255,255,0.7)",
                background: "rgba(0,0,0,0.15)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                borderRadius: 6,
                padding: "3px 8px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div style={{ fontSize: "9px", opacity: 0.7, marginTop: "4px", textAlign: "right" }}>
          {formatMsgTime(msg.dateAdded || msg.date)}
        </div>
      )}
    </div>
  );
})}
            </div>
          )}

          {/* SMS Input */}
{ghlData.contactId && (
  <form
    onSubmit={handleSmsSubmit}
    style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}
  >
    <textarea
      placeholder="Type a message..."
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

    {scheduleAt && (
      <div style={{
        fontSize: 12, fontWeight: 600, color: "#92400e", background: "#fffbeb",
        border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 10px",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
      }}>
        <span>Will send {formatMsgTime(scheduleAt)}</span>
        <button type="button" onClick={() => setScheduleAt("")}
          style={{ border: "none", background: "transparent", color: "#b45309", fontWeight: 700, cursor: "pointer", textDecoration: "underline", fontSize: 12 }}>
          Clear
        </button>
      </div>
    )}

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{
          display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px",
          backgroundColor: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "6px",
          fontSize: "13px", cursor: "pointer", color: "#334155"
        }}>
          📷 Add Photo
          <input type="file" accept="image/*" style={{ display: "none" }}
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
          <input type="checkbox" checked={sendAsInternal} onChange={(e) => setSendAsInternal(e.target.checked)} />
          Internal comment
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="datetime-local"
          value={scheduleAt}
          onChange={(e) => setScheduleAt(e.target.value)}
          style={{
            height: 36, border: "1px solid #cbd5e1", borderRadius: 8,
            padding: "0 10px", fontSize: 13, color: "#0f172a", background: "#fff",
          }}
        />
        <button
          type="submit"
          disabled={sendingSms || (!newSmsText.trim() && !smsFile)}
          style={{
            height: 36, padding: "0 16px", border: "none", borderRadius: 8,
            fontSize: 13, fontWeight: 700, color: "#fff",
            background: scheduleAt ? "#f59e0b" : "#2563eb",
            opacity: sendingSms || (!newSmsText.trim() && !smsFile) ? 0.5 : 1,
            cursor: sendingSms || (!newSmsText.trim() && !smsFile) ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {sendingSms ? (scheduleAt ? "Scheduling..." : "Sending...") : scheduleAt ? "Schedule" : "Send now"}
        </button>
      </div>
    </div>
  </form>
)}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
          background: "#0f172a", color: "#fff", padding: "10px 16px", borderRadius: 10,
          fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        }}>
          {toast}
        </div>
      )}
      {confirmCancel && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
          onClick={() => setConfirmCancel(null)}
        >
          <div
            style={{ background: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 360, boxShadow: "0 20px 50px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>Cancel scheduled message?</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16, lineHeight: 1.4 }}>
              This removes it from the queue in the app and in GHL. It will not be sent.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setConfirmCancel(null)}
                style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Keep it
              </button>
              <button type="button" onClick={confirmCancelScheduled}
                style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Cancel message
              </button>
            </div>
          </div>
        </div>
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
              No staff notes found.
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
              No appointments found for this contact.
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

      {activeTab === "settings" && (
        <div>
          <EditMemberForm
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            editFormData={editFormData}
            setEditFormData={setEditFormData}
            selectedMember={selectedMember}
            onSaveEdit={onSaveEdit}
          />
          <MemberFooter
            memberId={selectedMember.id}
            onDeleteMember={onDeleteMember}
          />
        </div>
      )}
      </div>
    </div>
  );
}

const styles = {
  sectionCard: {
    backgroundColor: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "8px 0 0",
    marginBottom: 0,
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  tabHeaderBar: {
    display: "flex",
    gap: 0,
    marginBottom: 8,
    flexWrap: "nowrap",
    overflowX: "auto",
    overflowY: "hidden",
    flexShrink: 0,
    borderBottom: "1px solid #e2e8f0",
  },
  tabBody: {
    flex: 1,
    minHeight: 0,
    overflowX: "hidden",
    overflowY: "auto",
  },
  smsPanel: {
    flex: 1,
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  smsThread: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    display: "flex",
    flexDirection: "column-reverse",
    gap: "8px",
    paddingRight: "4px",
    marginBottom: "12px",
  },
  tabBtn: {
    flex: 1,
    padding: "8px 6px",
    fontSize: 12,
    border: "none",
    borderBottom: "2px solid transparent",
    background: "none",
    color: "#64748b",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontWeight: 600,
  },
  tabBtnActive: {
    flex: 1,
    padding: "8px 6px",
    fontSize: 12,
    border: "none",
    borderBottom: "2px solid #2563eb",
    background: "none",
    color: "#1d4ed8",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
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
  fillPanel: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  historyLogList: {
    flex: 1,
    minHeight: 0,
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