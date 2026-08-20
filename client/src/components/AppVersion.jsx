import React, { useEffect, useState } from "react";
import { APP_VERSION } from "../version";

export default function AppVersion() {
  const [latest, setLatest] = useState(APP_VERSION);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && data?.version) setLatest(String(data.version));
      } catch {
        /* ignore */
      }
    };
    check();
    const id = setInterval(check, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const stale = latest && latest !== APP_VERSION;

  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 10, color: "#64748b", fontFamily: "ui-monospace, monospace" }}>
        v{APP_VERSION}
      </div>
      {stale && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 4,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid #f59e0b",
            background: "#fffbeb",
            color: "#92400e",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          New version {latest}. Tap to refresh.
        </button>
      )}
    </div>
  );
}