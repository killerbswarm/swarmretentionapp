import React from "react";

export default function AddMemberModal({ 
  newMember, 
  setNewMember, 
  onSubmit, 
  onClose 
}) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Add New Member</h3>
        <form onSubmit={onSubmit} style={styles.form}>
          <div style={{ display: "flex", gap: "10px" }}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>First Name *</label>
              <input 
                style={styles.input}
                type="text" 
                required
                value={newMember.firstName} 
                onChange={e => setNewMember({...newMember, firstName: e.target.value})}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Last Name</label>
              <input 
                style={styles.input}
                type="text" 
                value={newMember.lastName} 
                onChange={e => setNewMember({...newMember, lastName: e.target.value})}
              />
            </div>
          </div>

          <label style={styles.label}>Email</label>
          <input 
            style={styles.input}
            type="email" 
            value={newMember.email} 
            onChange={e => setNewMember({...newMember, email: e.target.value})}
          />

          <label style={styles.label}>Phone</label>
          <input 
            style={styles.input}
            type="text" 
            value={newMember.phone} 
            onChange={e => setNewMember({...newMember, phone: e.target.value})}
          />

          <label style={styles.label}>Date Added (App Signup)</label>
          <input 
            style={styles.input}
            type="date" 
            value={newMember.dateAdded} 
            onChange={e => setNewMember({...newMember, dateAdded: e.target.value})}
          />

          <label style={styles.label}>InBody Scans Completed</label>
          <div style={{ display: "flex", gap: "12px", margin: "4px 0" }}>
            <label style={{ fontSize: "13px" }}>
              <input 
                type="checkbox" 
                checked={newMember.scan1} 
                onChange={e => setNewMember({...newMember, scan1: e.target.checked})}
              /> Scan 1
            </label>
            <label style={{ fontSize: "13px" }}>
              <input 
                type="checkbox" 
                checked={newMember.scan2} 
                onChange={e => setNewMember({...newMember, scan2: e.target.checked})}
              /> Scan 2
            </label>
            <label style={{ fontSize: "13px" }}>
              <input 
                type="checkbox" 
                checked={newMember.scan3} 
                onChange={e => setNewMember({...newMember, scan3: e.target.checked})}
              /> Scan 3
            </label>
          </div>

          <label style={styles.label}>Status</label>
          <select 
            style={styles.input}
            value={newMember.status}
            onChange={e => setNewMember({...newMember, status: e.target.value})}
          >
            <option value="pending">⏳ Pending (Waiting for 1st check-in)</option>
            <option value="active">🔥 Active (Already started onboarding)</option>
          </select>

          {newMember.status === "active" && (
            <>
              <label style={styles.label}>Start Date (1st Check-In)</label>
              <input 
                style={styles.input}
                type="date" 
                value={newMember.startDate} 
                onChange={e => setNewMember({...newMember, startDate: e.target.value})}
              />

              <label style={styles.label}>Total Check-Ins To Date</label>
              <input 
                style={styles.input}
                type="number" 
                min="0"
                placeholder="e.g. 8"
                value={newMember.totalCheckIns} 
                onChange={e => setNewMember({...newMember, totalCheckIns: e.target.value})}
              />
            </>
          )}

          <div style={styles.modalActions}>
            <button type="submit" style={styles.saveBtn}>Add Member</button>
            <button type="button" style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  modalOverlay: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: "24px",
    borderRadius: "12px",
    width: "420px",
    maxWidth: "90%",
    maxHeight: "90vh",
    overflowY: "auto",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  label: {
    fontSize: "11px",
    fontWeight: "600",
    color: "#475569",
  },
  input: {
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    width: "100%",
    boxSizing: "border-box",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "16px",
  },
  saveBtn: {
    padding: "8px 16px",
    borderRadius: "6px",
    backgroundColor: "#2563eb",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontWeight: "600",
  },
  cancelBtn: {
    padding: "8px 16px",
    borderRadius: "6px",
    backgroundColor: "#e2e8f0",
    color: "#334155",
    border: "none",
    cursor: "pointer",
  },
};