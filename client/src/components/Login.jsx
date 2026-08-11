import React from "react";

export default function Login({ 
  passwordInput, 
  setPasswordInput, 
  passwordError, 
  onSubmit 
}) {
  return (
    <div style={styles.lockScreenContainer}>
      <div style={styles.lockCard}>
        <div style={styles.lockIcon}>🔐</div>
        <h2 style={styles.lockTitle}>Swarm Member Retention App</h2>
        <p style={styles.lockSubtitle}>Enter the staff password to open the dashboard</p>
        
        <form onSubmit={onSubmit} style={styles.lockForm}>
          <input 
            type="password"
            placeholder="Enter Password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            style={passwordError ? styles.lockInputError : styles.lockInput}
            autoFocus
          />
          {passwordError && (
            <p style={styles.errorText}>Incorrect Password. Please try again.</p>
          )}
          <button type="submit" style={styles.lockBtn}>
            Unlock Dashboard
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  lockScreenContainer: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    padding: "20px",
  },
  lockCard: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "40px 36px",
    width: "100%",
    maxWidth: "420px",
    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.4)",
    textAlign: "center",
  },
  lockIcon: {
    fontSize: "48px",
    marginBottom: "16px",
  },
  lockTitle: {
    margin: "0 0 8px 0",
    fontSize: "24px",
    fontWeight: "700",
    color: "#0f172a",
  },
  lockSubtitle: {
    margin: "0 0 28px 0",
    fontSize: "15px",
    color: "#64748b",
  },
  lockForm: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  lockInput: {
    padding: "14px 16px",
    fontSize: "16px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    outline: "none",
  },
  lockInputError: {
    padding: "14px 16px",
    fontSize: "16px",
    borderRadius: "10px",
    border: "2px solid #dc2626",
    outline: "none",
  },
  errorText: {
    margin: "0",
    color: "#dc2626",
    fontSize: "14px",
    fontWeight: "500",
  },
  lockBtn: {
    marginTop: "6px",
    padding: "14px",
    fontSize: "16px",
    fontWeight: "600",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
  },
};