import React from "react";

export default function EditMemberForm({
  isEditing,
  setIsEditing,
  editFormData,
  setEditFormData,
  selectedMember,
  onSaveEdit,
}) {
  return (
    <div style={styles.sectionCard}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        marginBottom: "10px" 
      }}>
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
              <label style={styles.label}>Date Added</label>
              <input 
                style={styles.input}
                type="date" 
                value={editFormData.dateAddedFormatted || ""} 
                onChange={e => setEditFormData({...editFormData, dateAddedFormatted: e.target.value})}
              />
            </div>
            <div>
              <label style={styles.label}>Start Date</label>
              <input 
                style={styles.input}
                type="date" 
                value={editFormData.startDateFormatted || ""} 
                onChange={e => setEditFormData({...editFormData, startDateFormatted: e.target.value})}
              />
            </div>
            <div>
              <label style={styles.label}>Status</label>
              <select
                style={styles.input}
                value={editFormData.status || "pending"}
                onChange={e => setEditFormData({...editFormData, status: e.target.value})}
              >
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="graduated">Graduated</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Weekly Check-Ins Grid */}
          <div>
            <label style={styles.label}>Weekly Check-In Counts</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px", marginTop: "6px" }}>
              {[...Array(12)].map((_, i) => {
                const wNum = i + 1;
                return (
                  <div key={wNum} style={{ textAlign: "center" }}>
                    <span style={{ fontSize: "10px", fontWeight: "700", color: "#64748b" }}>Wk {wNum}</span>
                    <input 
                      type="number"
                      min="0"
                      style={{ 
                        width: "100%", 
                        padding: "4px", 
                        borderRadius: "4px", 
                        border: "1px solid #cbd5e1", 
                        textAlign: "center", 
                        fontSize: "12px" 
                      }}
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
            <button type="submit" style={styles.saveBtn}>
              Save All Settings & Check-Ins
            </button>
          </div>
        </form>
      ) : (
        <div style={{ fontSize: "13px", color: "#6b7280" }}>
          Status: <strong>{selectedMember.status}</strong> • Current Onboarding Week: <strong>Week {selectedMember.currentWeek}</strong>
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
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  },
  label: {
    fontSize: "11px",
    fontWeight: "600",
    color: "#475569",
    display: "block",
    marginBottom: "4px",
  },
  input: {
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    width: "100%",
    boxSizing: "border-box",
    fontSize: "13px",
  },
  secondaryBtn: {
    backgroundColor: "#f1f5f9",
    color: "#334155",
    border: "1px solid #cbd5e1",
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    cursor: "pointer",
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
};