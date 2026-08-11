import React, { useEffect, useState } from "react";
import { stripHtml } from "../utils/helpers";

export default function AtRiskDetailModal({
  member,
  onClose,
  onRemoveFromAtRisk, 
}) {
  const [ghlData, setGhlData] = useState({ messages: [], notes: [], contactId: null });
  const [loadingGhl, setLoadingGhl] = useState(false);
  const [activeTab, setActiveTab] = useState("messages");
  const [newNoteText, setNewNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [newSmsText, setNewSmsText] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [smsFile, setSmsFile] = useState(null);
  const [smsFilePreview, setSmsFilePreview] = useState(null);

  // Fetch GHL data when modal opens
  useEffect(() => {
    if (!member) return;

    const fetchGhl = async () => {
      setLoadingGhl(true);
      try {
        const params = new URLSearchParams();
        if (member.ghlContactId) params.append("contactId", member.ghlContactId);
        if (member.email) params.append("email", member.email);

        const res = await fetch(
          `https://us-central1-swarm-12-week-startup.cloudfunctions.net/getGhlContactDetails?${params}`
        );
        const data = await res.json();
        setGhlData({
          messages: data.messages || [],
          notes: data.notes || [],
          contactId: data.contactId || member.ghlContactId || null,
        });
      } catch (err) {
        console.error("Failed to load GHL data:", err);
      } finally {
        setLoadingGhl(false);
      }
    };

    fetchGhl();
  }, [member]);

  if (!member) return null;

const lastSmsDate = ghlData.messages?.length
  ? new Date(
      Math.max(
        ...ghlData.messages.map((m) => new Date(m.dateAdded || m.date || 0).getTime())
      )
    )
  : null;

const lastSmsStr = lastSmsDate
  ? lastSmsDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
  : "No SMS yet";

  const daysOut = member.daysOut || 0;
  const lastCheckInStr = member.lastCheckIn
    ? new Date(member.lastCheckIn).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown";

  const atRiskSinceStr = member.atRiskSince
    ? new Date(member.atRiskSince).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const handleSendSms = async (e) => {
  e.preventDefault();
  if ((!newSmsText.trim() && !smsFile) || !ghlData.contactId) return;

  setSendingSms(true);
  try {
    let attachments = [];

    if (smsFile) {
      // You can reuse the same compress + upload logic here,
      // or for now just upload without compression to test
      const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const { storage } = await import("../firebase");

      const fileRef = ref(
        storage,
        `sms-media/${ghlData.contactId}/${Date.now()}_photo.jpg`
      );
      await uploadBytes(fileRef, smsFile);
      const downloadURL = await getDownloadURL(fileRef);
      attachments.push(downloadURL);
    }

    const res = await fetch(
      "https://us-central1-swarm-12-week-startup.cloudfunctions.net/sendGhlSms",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: ghlData.contactId,
          message: newSmsText.trim() || "",
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      }
    );

    const data = await res.json();

   if (res.ok && data.success) {
  setNewSmsText("");
  setSmsFile(null);
  setSmsFilePreview(null);

  // Refresh the conversation
  const params = new URLSearchParams();
  if (member.ghlContactId) params.append("contactId", member.ghlContactId);
  if (member.email) params.append("email", member.email);

  const refreshRes = await fetch(
    `https://us-central1-swarm-12-week-startup.cloudfunctions.net/getGhlContactDetails?${params}`
  );
  const refreshData = await refreshRes.json();
  setGhlData({
    messages: refreshData.messages || [],
    notes: refreshData.notes || [],
    contactId: refreshData.contactId || ghlData.contactId,
  });
} else {
      alert(`Failed to send SMS: ${data.error || "Unknown error"}`);
    }
  } catch (err) {
    console.error(err);
    alert("Error sending SMS");
  } finally {
    setSendingSms(false);
  }
};

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={{ margin: 0, fontSize: "22px" }}>
              {member.firstName} {member.lastName}
            </h2>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "14px" }}>
              {member.email || "No email"} • {member.phone || "No phone"}
            </p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.body}>
        {/* Big Days Out Card */}
   <div style={styles.daysOutCard}>
  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
    <div style={styles.daysOutNumber}>{daysOut}</div>
    <div>
      <div style={styles.daysOutLabel}>Days Since Last Visit</div>
      <div style={styles.daysOutSub}>
        Last check-in: <strong>{lastCheckInStr}</strong>
        <br />
        Last SMS: <strong>{lastSmsStr}</strong>
        <br />
        Flagged: {atRiskSinceStr}
      </div>
    </div>
  </div>
</div>

        {/* Tabs */}
        <div style={styles.tabBar}>
          <button
            style={activeTab === "messages" ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab("messages")}
          >
            💬 SMS ({ghlData.messages.length})
          </button>
          <button
            style={activeTab === "notes" ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab("notes")}
          >
            📝 Notes ({ghlData.notes.length})
          </button>
        </div>

        {/* Tab Content */}
       <div style={styles.tabContent}>
  {loadingGhl ? (
    <p style={{ color: "#64748b" }}>Loading GHL data...</p>
  ) : activeTab === "messages" ? (
    <div>
      {ghlData.messages.length === 0 ? (
        <p style={{ color: "#94a3b8", fontStyle: "italic" }}>No SMS history found</p>
      ) : (
        <div style={styles.messageList}>
          {ghlData.messages.map((msg) => {
            const isOutbound = msg.direction === "outbound";
            const attachments = msg.attachments || [];

            return (
              <div
                key={msg.id || Math.random()}
                style={{
                  ...styles.messageBubble,
                  alignSelf: isOutbound ? "flex-end" : "flex-start",
                  backgroundColor: isOutbound ? "#2563eb" : "#f1f5f9",
                  color: isOutbound ? "#fff" : "#0f172a",
                }}
              >
                {msg.body && (
                  <div style={{ whiteSpace: "pre-wrap" }}>{msg.body}</div>
                )}

                {attachments.length > 0 && (
                  <div style={{ marginTop: msg.body ? "8px" : 0 }}>
                    {attachments.map((url, idx) => (
                      <img
                        key={idx}
                        src={typeof url === "string" ? url : url.url}
                        alt="Attachment"
                        style={{
                          maxWidth: "100%",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                        onClick={() =>
                          window.open(
                            typeof url === "string" ? url : url.url,
                            "_blank"
                          )
                        }
                      />
                    ))}
                  </div>
                )}

                <div style={styles.messageTime}>
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

      {/* Compose box */}
      {ghlData.contactId && (
   <form
  onSubmit={handleSendSms}
  style={{
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginTop: "14px",
    marginBottom: "24px",   // add this
  }}
>
          <textarea
            placeholder="Type text message to send via GHL..."
            value={newSmsText || ""}
            onChange={(e) => setNewSmsText(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "14px",
              resize: "vertical",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />

          {smsFilePreview && (
            <div
              style={{
                position: "relative",
                display: "inline-block",
                maxWidth: "180px",
              }}
            >
              <img
                src={smsFilePreview}
                alt="Preview"
                style={{
                  width: "100%",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
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
                  top: 4,
                  right: 4,
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "50%",
                  width: 24,
                  height: 24,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                backgroundColor: "#f1f5f9",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
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

            <button
              type="submit"
              disabled={sendingSms || (!(newSmsText || "").trim() && !smsFile)}
              style={{
                backgroundColor: "#16a34a",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: 6,
                fontWeight: 600,
                cursor: "pointer",
                opacity:
                  sendingSms || (!newSmsText.trim() && !smsFile) ? 0.6 : 1,
              }}
            >
              {sendingSms ? "Sending..." : "Send SMS"}
            </button>
          </div>
        </form>
      )}
    </div>
  ) : (
    <div>
      {ghlData.notes.length === 0 ? (
        <p style={{ color: "#94a3b8", fontStyle: "italic" }}>
          No staff notes found
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {ghlData.notes.map((note) => (
            <div key={note.id || Math.random()} style={styles.noteCard}>
              <div style={{ whiteSpace: "pre-wrap" }}>
                {stripHtml(note.body || note.note || "")}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#94a3b8",
                  marginTop: "6px",
                }}
              >
                {new Date(note.dateAdded || note.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )}
</div>
</div>

{/* ===== FOOTER ===== */}
  <div style={styles.footer}>
    <button style={styles.removeBtn} onClick={() => onRemoveFromAtRisk(member.id)}>
      Remove from At Risk
    </button>
    <button style={styles.closeFooterBtn} onClick={onClose}>
      Close
    </button>
  </div>
</div>
    </div>
  );
}


const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "20px",
  },
modal: {
  backgroundColor: "#fff",
  borderRadius: "16px",
  width: "100%",
  maxWidth: "640px",
  maxHeight: "90vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",          // important
},
  body: {
  flex: 1,
  overflowY: "auto",
  padding: "0 24px 24px",
},

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "20px 24px",
    borderBottom: "1px solid #e2e8f0",
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: "20px",
    cursor: "pointer",
    color: "#64748b",
  },
daysOutCard: {
  margin: "16px 0",
  backgroundColor: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: "10px",
  padding: "14px 18px",
},
daysOutNumber: {
  fontSize: "36px",
  fontWeight: "800",
  color: "#dc2626",
  lineHeight: 1,
  minWidth: "50px",
},
daysOutLabel: {
  fontSize: "13px",
  fontWeight: "700",
  color: "#991b1b",
},
daysOutSub: {
  fontSize: "12px",
  color: "#7f1d1d",
  marginTop: "4px",
  lineHeight: 1.4,
},
  tabBar: {
    display: "flex",
    gap: "8px",
    padding: "0 24px",
    marginBottom: "12px",
  },
  tab: {
    padding: "6px 14px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    backgroundColor: "#f8fafc",
    fontSize: "13px",
    cursor: "pointer",
  },
  tabActive: {
    padding: "6px 14px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "#2563eb",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
tabContent: {
  padding: "0 24px 80px",   // was probably much smaller
  minHeight: "200px",
},
  messageList: {
    display: "flex",
    flexDirection: "column-reverse",
    gap: "8px",
    maxHeight: "260px",
    overflowY: "auto",
  },
  messageBubble: {
    padding: "8px 12px",
    borderRadius: "10px",
    maxWidth: "80%",
    fontSize: "13px",
  },
  messageTime: {
    fontSize: "10px",
    opacity: 0.7,
    marginTop: "4px",
    textAlign: "right",
  },
  noteCard: {
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "13px",
  },
footer: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px 24px",
  borderTop: "1px solid #e2e8f0",
  backgroundColor: "#f8fafc",
  flexShrink: 0,               // prevents footer from shrinking
},
  removeBtn: {
    backgroundColor: "#ef4444",
    color: "#fff",
    border: "none",
    padding: "8px 16px",
    borderRadius: "6px",
    fontWeight: "600",
    cursor: "pointer",
  },
  closeFooterBtn: {
    backgroundColor: "#f1f5f9",
    color: "#334155",
    border: "1px solid #cbd5e1",
    padding: "8px 16px",
    borderRadius: "6px",
    cursor: "pointer",
  },
};