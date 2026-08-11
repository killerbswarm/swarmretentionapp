import React, { useState } from "react";

export default function AddAtRiskModal({ onClose, onSave }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [lastCheckIn, setLastCheckIn] = useState("");
  const [loading, setLoading] = useState(false);
  const [matched, setMatched] = useState(null); // GHL contact data
  const [error, setError] = useState("");

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!email.trim() && !phone.trim()) {
      setError("Enter an email or phone number");
      return;
    }

    setLoading(true);
    setError("");
    setMatched(null);

    try {
      const params = new URLSearchParams();
      if (email.trim()) params.append("email", email.trim());
      // phone lookup is limited – email works best with current endpoint

      const res = await fetch(
        `https://us-central1-swarm-12-week-startup.cloudfunctions.net/getGhlContactDetails?${params}`
      );
      const data = await res.json();

      if (!data.contactId) {
        setError("No matching contact found in GHL. You can still add them manually.");
        // Allow manual entry
        setMatched({
          firstName: "",
          lastName: "",
          email: email.trim(),
          phone: phone.trim(),
          contactId: null,
        });
      } else {
        setMatched({
          firstName: data.firstName || "",
          lastName: data.lastName || "",
          email: data.email || email.trim(),
          phone: data.phone || phone.trim(),
          contactId: data.contactId,
        });
      }
    } catch (err) {
      console.error(err);
      setError("Failed to look up contact. You can still add manually.");
      setMatched({
        firstName: "",
        lastName: "",
        email: email.trim(),
        phone: phone.trim(),
        contactId: null,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!matched) return;

    const daysOut = lastCheckIn
      ? Math.floor((new Date() - new Date(lastCheckIn)) / (1000 * 60 * 60 * 24))
      : 7;

    onSave({
      firstName: matched.firstName || "Unknown",
      lastName: matched.lastName || "",
      email: matched.email || "",
      phone: matched.phone || "",
      ghlContactId: matched.contactId || null,
      lastCheckIn: lastCheckIn ? new Date(lastCheckIn).toISOString() : null,
      daysOut,
      atRiskSince: new Date().toISOString(),
    });
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Add At Risk Member</h2>
        <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>
          Look up a contact in GHL by email, then confirm the details.
        </p>

        {!matched ? (
          <form onSubmit={handleLookup}>
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <input
                style={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@email.com"
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Phone (optional)</label>
              <input
                style={styles.input}
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="4135551234"
              />
            </div>

            {error && <p style={{ color: "#dc2626", fontSize: "13px" }}>{error}</p>}

            <div style={styles.actions}>
              <button type="button" style={styles.cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" style={styles.primaryBtn} disabled={loading}>
                {loading ? "Looking up..." : "Look Up in GHL"}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div style={styles.matchedCard}>
              <div style={{ fontWeight: "700", fontSize: "16px" }}>
                {matched.firstName || "(No first name)"} {matched.lastName || ""}
              </div>
              <div style={{ color: "#64748b", fontSize: "13px", marginTop: "4px" }}>
                {matched.email || "No email"} • {matched.phone || "No phone"}
              </div>
              {matched.contactId && (
                <div style={{ fontSize: "12px", color: "#16a34a", marginTop: "6px" }}>
                  ✓ Matched in GHL
                </div>
              )}
            </div>

            {/* Allow editing name if GHL didn't return it */}
            <div style={styles.field}>
              <label style={styles.label}>First Name</label>
              <input
                style={styles.input}
                value={matched.firstName}
                onChange={(e) => setMatched({ ...matched, firstName: e.target.value })}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Last Name</label>
              <input
                style={styles.input}
                value={matched.lastName}
                onChange={(e) => setMatched({ ...matched, lastName: e.target.value })}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Last Check-In Date</label>
              <input
                style={styles.input}
                type="date"
                value={lastCheckIn}
                onChange={(e) => setLastCheckIn(e.target.value)}
              />
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                Leave blank to default to 7 days out
              </div>
            </div>

            <div style={styles.actions}>
              <button
                type="button"
                style={styles.cancelBtn}
                onClick={() => setMatched(null)}
              >
                Back
              </button>
              <button type="button" style={styles.primaryBtn} onClick={handleSave}>
                Add to At Risk
              </button>
            </div>
          </div>
        )}
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
    zIndex: 1100,
    padding: "20px",
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    width: "100%",
    maxWidth: "420px",
    padding: "24px",
  },
  field: {
    marginBottom: "14px",
  },
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: "600",
    color: "#475569",
    marginBottom: "4px",
  },
  input: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    boxSizing: "border-box",
  },
  matchedCard: {
    backgroundColor: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "8px",
    padding: "12px 14px",
    marginBottom: "16px",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "20px",
  },
  primaryBtn: {
    backgroundColor: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "9px 16px",
    borderRadius: "6px",
    fontWeight: "600",
    cursor: "pointer",
  },
  cancelBtn: {
    backgroundColor: "#f1f5f9",
    color: "#334155",
    border: "1px solid #cbd5e1",
    padding: "9px 16px",
    borderRadius: "6px",
    cursor: "pointer",
  },
};