
import React from "react";
import { WEEKDAY_OPTIONS } from "../utils/helpers";

export default function SettingsView({
  styles,
  darkMode,
  setDarkMode,
  weekStartDay,
  setWeekStartDay,
  scanBusy,
  scanMsg,
  runAtRiskScanNow,
}) {
  return (
    <div className="ret-settings">
      <h2>Appearance</h2>
      <p>Switch between light and dark. Saved on this device.</p>
      <button type="button" onClick={() => setDarkMode(!darkMode)} style={styles.addBtn}>
        {darkMode ? "Use light mode" : "Use dark mode"}
      </button>

      <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid #e2e8f0" }} />

      <h2>12-week calendar</h2>
      <p>
        Program weeks always start on this day. If a member’s first check-in is mid-week,
        week 1 begins on the next chosen start day (the partial week is not counted).
        Weeks run 7 days and the 12-week program ends the day before the next start day.
      </p>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
        Week starts on
      </label>
      <select
        value={Number(weekStartDay)}
        onChange={(e) => setWeekStartDay(Number(e.target.value))}
        style={{
          width: "100%",
          maxWidth: 280,
          height: 40,
          borderRadius: 10,
          border: "1px solid #cbd5e1",
          padding: "0 12px",
          fontSize: 14,
          fontWeight: 600,
          color: "#0f172a",
          background: "#fff",
        }}
      >
        {WEEKDAY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid #e2e8f0" }} />

      <h2>At-risk scan</h2>
      <p>
        Same job that runs every night at 7am. Checks GHL tags and removes pending cancel,
        cancelled, inactive, nomembership, and former members.
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