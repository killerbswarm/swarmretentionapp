import React, { useEffect, useState, useRef } from "react";
import { stripHtml } from "../utils/helpers";
import { db, storage } from "../firebase";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export default function AtRiskDetailModal({ member, onClose, onRemoveFromAtRisk }) {
  const [ghlData, setGhlData] = useState({ messages: [], notes: [], contactId: null });
  const [loadingGhl, setLoadingGhl] = useState(false);
  const [activeTab, setActiveTab] = useState("messages");
  const [newSmsText, setNewSmsText] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [smsFile, setSmsFile] = useState(null);
  const [smsFilePreview, setSmsFilePreview] = useState(null);
  const [sendAsInternal, setSendAsInternal] = useState(false);
  const [reachOutNote, setReachOutNote] = useState("");
  const [savingReachOut, setSavingReachOut] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ghlData.messages]);

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

  const daysOut = member.daysOut || 0;
  const lastCheckInStr = member.lastCheckIn
    ? new Date(member.lastCheckIn).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
  const atRiskSinceStr = member.atRiskSince
    ? new Date(member.atRiskSince).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

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

  const refreshGhl = async () => {
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
  };

  const dayKey = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return "";
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  };

  const hasReachOutToday = () => {
    const today = dayKey();
    return (member.reachOuts || []).some((r) => dayKey(r.at) === today);
  };

  const saveReachOuts = async (next) => {
    await setDoc(
      doc(db, "atRiskMembers", member.id),
      {
        reachOuts: next,
        lastReachOutAt: next.length ? next[next.length - 1].at : null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  };

  const saveStaffNotes = async (next) => {
    await setDoc(
      doc(db, "atRiskMembers", member.id),
      { staffNotes: next, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  };

  const handleAddStaffNote = async () => {
    if (!member?.id || !newNoteText.trim()) return;
    setSavingNote(true);
    try {
      const existing = Array.isArray(member.staffNotes) ? member.staffNotes : [];
      await saveStaffNotes([
        ...existing,
        { id: Date.now().toString(), text: newNoteText.trim(), at: new Date().toISOString() },
      ]);
      setNewNoteText("");
    } catch (err) {
      alert("Failed to add note: " + (err?.message || String(err)));
    } finally {
      setSavingNote(false);
    }
  };

  const handleEditStaffNote = async (note) => {
    const next = window.prompt("Edit note", note.text || "");
    if (next == null) return;
    const existing = Array.isArray(member.staffNotes) ? member.staffNotes : [];
    await saveStaffNotes(
      existing.map((n) =>
        n.id === note.id ? { ...n, text: next.trim(), updatedAt: new Date().toISOString() } : n
      )
    );
  };

  const handleDeleteStaffNote = async (note) => {
    if (!window.confirm("Delete this note?")) return;
    const existing = Array.isArray(member.staffNotes) ? member.staffNotes : [];
    await saveStaffNotes(existing.filter((n) => n.id !== note.id));
  };

  const handleEditReachOut = async (idx) => {
    const current = (member.reachOuts || [])[idx];
    if (!current) return;
    const next = window.prompt("Edit reach-out memo", current.note || "");
    if (next == null) return;
    const list = [...(member.reachOuts || [])];
    list[idx] = { ...current, note: next.trim(), updatedAt: new Date().toISOString() };
    await saveReachOuts(list);
  };

  const handleDeleteReachOut = async (idx) => {
    if (!window.confirm("Delete this reach-out?")) return;
    const list = (member.reachOuts || []).filter((_, i) => i !== idx);
    await saveReachOuts(list);
  };

  const maybeLogSmsReachOut = async (text) => {
    if (!member?.id || hasReachOutToday()) return;
    const existing = Array.isArray(member.reachOuts) ? member.reachOuts : [];
    const entry = {
      at: new Date().toISOString(),
      note: (text || "").trim() || "SMS",
      source: "sms",
    };
    await saveReachOuts([...existing, entry]);
  };

  const handleLogReachOut = async () => {
    if (!member?.id) return;
    setSavingReachOut(true);
    try {
      const existing = Array.isArray(member.reachOuts) ? member.reachOuts : [];
      const entry = {
        at: new Date().toISOString(),
        note: reachOutNote.trim() || "Reach-out",
      };
      await setDoc(
        doc(db, "atRiskMembers", member.id),
        {
          reachOuts: [...existing, entry],
          lastReachOutAt: entry.at,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setReachOutNote("");
    } catch (err) {
      console.error(err);
      alert("Failed to log reach-out: " + (err?.message || String(err)));
    } finally {
      setSavingReachOut(false);
    }
  };

  const handleSendSms = async (e) => {
    e.preventDefault();
    if (!ghlData.contactId) return;

    if (sendAsInternal) {
      if (!newSmsText.trim()) return;
      setSendingSms(true);
      try {
        const res = await fetch(
          "https://us-central1-swarm-12-week-startup.cloudfunctions.net/sendGhlInternalComment",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contactId: ghlData.contactId,
              message: newSmsText.trim(),
            }),
          }
        );
        const data = await res.json();
        if (res.ok && data.success) {
          setNewSmsText("");
          setSendAsInternal(false);
          await refreshGhl();
        } else {
          alert(data.error || "Failed to post internal comment");
        }
      } catch (err) {
        console.error(err);
        alert("Error posting internal comment: " + (err?.message || String(err)));
      } finally {
        setSendingSms(false);
      }
      return;
    }

    if (!newSmsText.trim() && !smsFile) return;
    setSendingSms(true);
    try {
      let attachments = [];
      if (smsFile) {
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
        const sent = newSmsText.trim();
        setNewSmsText("");
        setSmsFile(null);
        setSmsFilePreview(null);
        await maybeLogSmsReachOut(sent);
        await refreshGhl();
      } else {
        alert(data.error || "Failed to send SMS");
      }
    } catch (err) {
      console.error(err);
      alert("Error sending SMS: " + (err?.message || String(err)));
    } finally {
      setSendingSms(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* FIXED HEADER */}
        <div style={styles.header}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>
              {member.firstName} {member.lastName}
            </h2>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
              {member.email || "No email"} • {member.phone || "No phone"}
            </p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* FIXED SUMMARY */}
        <div style={{ padding: "0 24px", flexShrink: 0 }}>
          <div style={styles.daysOutCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={styles.daysOutNumber}>{daysOut}</div>
              <div>
                <div style={styles.daysOutLabel}>Days Since Last Visit</div>
                <div style={styles.daysOutSub}>
                  Last check-in: <strong>{lastCheckInStr}</strong>
                  <br />
                  Last SMS: <strong>{lastSmsStr}</strong>
                  <br />
                  Flagged: {atRiskSinceStr}
                  <br />
                  Reach-outs: <strong>{(member.reachOuts || []).length}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FIXED TABS */}
        <div style={styles.tabBar}>
          <button
            style={activeTab === "messages" ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab("messages")}
          >
            💬 SMS
          </button>
          <button
            style={activeTab === "notes" ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab("notes")}
          >
            📝 Notes
          </button>
          <button
            style={activeTab === "reachouts" ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab("reachouts")}
          >
            📤 Reach-outs
          </button>
        </div>

        {/* SCROLLABLE CONTENT ONLY */}
        <div style={{
          ...styles.scrollBody,
          overflowY: activeTab === "messages" ? "hidden" : "auto",
          display: activeTab === "messages" ? "flex" : undefined,
          flexDirection: activeTab === "messages" ? "column" : undefined,
        }}>
          {loadingGhl ? (
            <p style={{ color: "#64748b" }}>Loading...</p>
          ) : activeTab === "reachouts" ? (
            <div>
              {(member.reachOuts || []).length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: 13 }}>No reach-outs logged yet</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {[...(member.reachOuts || [])].map((r, idx, arr) => {
                    const rIdx = arr.length - 1 - idx;
                    const item = arr[rIdx];
                    return (
                      <div key={(item.at || "") + rIdx} style={{ ...styles.reachOutItem, display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div>
                          <strong>
                            {new Date(item.at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </strong>
                          {item.source === "sms" ? " · SMS" : ""}
                          {item.note ? ` — ${item.note}` : ""}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button type="button" style={styles.smallBtn} onClick={() => handleEditReachOut(rIdx)}>Edit</button>
                          <button type="button" style={styles.smallDanger} onClick={() => handleDeleteReachOut(rIdx)}>Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <input
                type="text"
                placeholder="Optional note (e.g. Hey we miss you)"
                value={reachOutNote}
                onChange={(e) => setReachOutNote(e.target.value)}
                style={styles.input}
              />
              {hasReachOutToday() && (
                <p style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                  A reach-out is already logged for today. Another SMS today won’t add a second one.
                </p>
              )}
              <button
                type="button"
                onClick={handleLogReachOut}
                disabled={savingReachOut || hasReachOutToday()}
                style={{
                  ...styles.primaryBtn,
                  opacity: savingReachOut ? 0.6 : 1,
                  marginTop: 8,
                }}
              >
                {savingReachOut ? "Saving..." : "+ Log Reach-out"}
              </button>
            </div>
          ) : activeTab === "messages" ? (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, height: "100%" }}>
              {(ghlData.messages || []).length === 0 ? (
                <p style={{ color: "#94a3b8", fontStyle: "italic" }}>No SMS history found</p>
              ) : (
                <div style={{ ...styles.messageList, flex: 1, minHeight: 0, overflowY: "auto" }}>
                  {[...(ghlData.messages || [])]
                    .sort(
                      (a, b) =>
                        new Date(a.dateAdded || a.date || 0) -
                        new Date(b.dateAdded || b.date || 0)
                    )
                    .map((msg) => {
                      const isInternal =
                        msg.messageType === "TYPE_INTERNAL_COMMENT" || msg.type === 37;

                      if (isInternal) {
                        return (
                          <div key={msg.id || Math.random()} style={styles.internalBubble}>
                            <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                              📝 Internal Comment
                            </div>
                            <div style={{ whiteSpace: "pre-wrap" }}>
                              {msg.body || msg.bodyText || ""}
                            </div>
                            <div style={styles.messageTime}>
                              {new Date(msg.dateAdded || msg.date || Date.now()).toLocaleString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                }
                              )}
                            </div>
                          </div>
                        );
                      }

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
                          {(msg.body || msg.bodyText) && (
                            <div style={{ whiteSpace: "pre-wrap" }}>
                              {msg.body || msg.bodyText}
                            </div>
                          )}
                          {attachments.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              {attachments.map((url, idx) => (
                                <img
                                  key={idx}
                                  src={typeof url === "string" ? url : url?.url}
                                  alt=""
                                  style={{
                                    maxWidth: "100%",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                  }}
                                  onClick={() =>
                                    window.open(
                                      typeof url === "string" ? url : url?.url,
                                      "_blank"
                                    )
                                  }
                                />
                              ))}
                            </div>
                          )}
                          <div style={styles.messageTime}>
                            {new Date(msg.dateAdded || msg.date || Date.now()).toLocaleString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              }
                            )}
                          </div>
                        </div>
                      );
                    })}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {ghlData.contactId && (
                <form onSubmit={handleSendSms} style={styles.composeForm}>
                  <textarea
                    placeholder="Type a message..."
                    value={newSmsText || ""}
                    onChange={(e) => setNewSmsText(e.target.value)}
                    rows={6}
                    style={styles.textarea}
                  />
                  {smsFilePreview && (
                    <div style={{ position: "relative", maxWidth: 180 }}>
                      <img
                        src={smsFilePreview}
                        alt="Preview"
                        style={{ width: "100%", borderRadius: 8, border: "1px solid #e2e8f0" }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSmsFile(null);
                          setSmsFilePreview(null);
                        }}
                        style={styles.previewClear}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div style={styles.composeActions}>
                    <label style={styles.photoLabel}>
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
                      Internal comment
                    </label>
                    <button
                      type="submit"
                      disabled={sendingSms || (!(newSmsText || "").trim() && !smsFile)}
                      style={{
                        ...styles.sendBtn,
                        opacity:
                          sendingSms || (!(newSmsText || "").trim() && !smsFile) ? 0.6 : 1,
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
              {(member.staffNotes || []).length === 0 && (ghlData.notes || []).length === 0 ? (
                <p style={{ color: "#94a3b8", fontStyle: "italic" }}>No staff notes yet</p>
              ) : null}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                {(member.staffNotes || []).slice().reverse().map((note) => (
                  <div key={note.id} style={styles.noteCard}>
                    <div style={{ whiteSpace: "pre-wrap" }}>{note.text}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>
                        {note.at ? new Date(note.at).toLocaleString() : ""}
                      </span>
                      <span style={{ display: "flex", gap: 6 }}>
                        <button type="button" style={styles.smallBtn} onClick={() => handleEditStaffNote(note)}>Edit</button>
                        <button type="button" style={styles.smallDanger} onClick={() => handleDeleteStaffNote(note)}>Delete</button>
                      </span>
                    </div>
                  </div>
                ))}
                {(ghlData.notes || []).map((note) => (
                  <div key={note.id || note.dateAdded} style={{ ...styles.noteCard, opacity: 0.85 }}>
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {stripHtml(note.body || note.note || "")}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
                      {new Date(note.dateAdded || note.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
              <textarea
                placeholder="Add a staff note..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                rows={3}
                style={styles.textarea}
              />
              <button
                type="button"
                onClick={handleAddStaffNote}
                disabled={savingNote || !newNoteText.trim()}
                style={{ ...styles.primaryBtn, marginTop: 8, opacity: savingNote || !newNoteText.trim() ? 0.6 : 1 }}
              >
                {savingNote ? "Saving..." : "+ Add note"}
              </button>
            </div>
          )}
        </div>

        {/* FIXED FOOTER */}
        <div style={styles.footer}>
          <button
            style={styles.removeBtn}
            onClick={() => onRemoveFromAtRisk(member.id)}
          >
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
    padding: 20,
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "100%",
    maxWidth: 640,
    height: "90vh",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "20px 24px",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: 20,
    cursor: "pointer",
    color: "#64748b",
  },
  daysOutCard: {
    margin: "12px 0",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 10,
    padding: "14px 18px",
  },
  daysOutNumber: {
    fontSize: 36,
    fontWeight: 800,
    color: "#dc2626",
    lineHeight: 1,
    minWidth: 50,
  },
  daysOutLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#991b1b",
  },
  daysOutSub: {
    fontSize: 12,
    color: "#7f1d1d",
    marginTop: 4,
    lineHeight: 1.4,
  },
  tabBar: {
    display: "flex",
    gap: 6,
    padding: "8px 16px",
    flexShrink: 0,
    borderBottom: "1px solid #e2e8f0",
    flexWrap: "nowrap",
  },
  tab: {
    flex: 1,
    padding: "6px 8px",
    whiteSpace: "nowrap",
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    backgroundColor: "#f8fafc",
    fontSize: 13,
    cursor: "pointer",
  },
  tabActive: {
    flex: 1,
    padding: "6px 8px",
    whiteSpace: "nowrap",
    borderRadius: 6,
    border: "none",
    backgroundColor: "#2563eb",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  scrollBody: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 24px",
    minHeight: 0,
  },
  messageList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 12,
  },
  messageBubble: {
    padding: "8px 12px",
    borderRadius: 10,
    maxWidth: "80%",
    fontSize: 13,
  },
  internalBubble: {
    alignSelf: "center",
    backgroundColor: "#fef9c3",
    border: "1px solid #fde047",
    color: "#713f12",
    padding: "8px 12px",
    borderRadius: 8,
    maxWidth: "90%",
    fontSize: 13,
  },
  messageTime: {
    fontSize: 10,
    opacity: 0.7,
    marginTop: 4,
    textAlign: "right",
  },
  noteCard: {
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
  },
  smallBtn: {
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    color: "#334155",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  smallDanger: {
    border: "none",
    background: "#fef2f2",
    color: "#dc2626",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  reachOutItem: {
    fontSize: 13,
    padding: "8px 12px",
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    fontSize: 13,
    boxSizing: "border-box",
  },
  primaryBtn: {
    backgroundColor: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "8px 14px",
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  composeForm: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: "auto",
    paddingTop: 12,
    flexShrink: 0,
  },
  textarea: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    fontSize: 14,
    resize: "vertical",
    minHeight: 120,
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  composeActions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  photoLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    backgroundColor: "#f1f5f9",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
  },
  sendBtn: {
    backgroundColor: "#16a34a",
    color: "#fff",
    border: "none",
    padding: "8px 16px",
    borderRadius: 6,
    fontWeight: 600,
    cursor: "pointer",
  },
  previewClear: {
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
  },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    borderTop: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    flexShrink: 0,
  },
  removeBtn: {
    backgroundColor: "#ef4444",
    color: "#fff",
    border: "none",
    padding: "8px 16px",
    borderRadius: 6,
    fontWeight: 600,
    cursor: "pointer",
  },
  closeFooterBtn: {
    backgroundColor: "#f1f5f9",
    color: "#334155",
    border: "1px solid #cbd5e1",
    padding: "8px 16px",
    borderRadius: 6,
    cursor: "pointer",
  },
};