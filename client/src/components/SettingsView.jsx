import React from "react";
export default function SettingsView({
  styles,
  darkMode,
  setDarkMode,
  scanBusy,
  scanMsg,
  runAtRiskScanNow
}) {
  return (
    <div className="ret-settings">
      <h2>Appearance</h2>
      <p>Switch between light and dark. Saved on this device.</p>
      <button
        type="button"
        onClick={() => setDarkMode(!darkMode)}
        style={styles.addBtn}
      >
        {darkMode ? "Use light mode" : "Use dark mode"}
      </button>

      <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid #e2e8f0" }} />

      <h2>At-risk scan</h2>
      <p>
        Same job that runs every night at 7am. Checks GHL tags and removes
        pending cancel, cancelled, inactive, nomembership, and former members.
      </p>
      <button
        type="button"
        disabled={scanBusy}
        onClick={runAtRiskScanNow}
        style={styles.addBtn}
      >
        {scanBusy ? "Scanning…" : "Scan at-risk now"}
      </button>
      {scanMsg && <p className="ret-scan-msg">{scanMsg}</p>}
    </div>
  );
}