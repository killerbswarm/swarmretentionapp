import React, { useEffect, useState } from "react";
import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../../firebase";
import { checkinsDb } from "../../checkinsFirebase";
import InBodyResultSheetModal from "./InBodyResultSheetModal";

function parseScanDate(dateVal) {
  if (!dateVal) return null;
  if (typeof dateVal.toDate === "function") {
    const d = dateVal.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateVal === "object" && (dateVal.seconds || dateVal._seconds)) {
    return new Date((dateVal.seconds || dateVal._seconds) * 1000);
  }
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) return dateVal;
  const str = String(dateVal).trim();
  if (/^\d{8,14}$/.test(str)) {
    const year = str.substring(0, 4);
    const month = str.substring(4, 6);
    const day = str.substring(6, 8);
    const hour = str.length >= 10 ? str.substring(8, 10) : "12";
    const min = str.length >= 12 ? str.substring(10, 12) : "00";
    const d = new Date(`${year}-${month}-${day}T${hour}:${min}:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function scanDateFromDoc(data) {
  return (
    parseScanDate(data.scanDate) ||
    parseScanDate(data.createdAt) ||
    parseScanDate(data.rawPayload && data.rawPayload.TestDatetimes) ||
    parseScanDate(data.TestDatetimes) ||
    parseScanDate(data.rawApi && data.rawApi.TestDatetimes)
  );
}

function formatDate(dateVal) {
  const d = parseScanDate(dateVal);
  if (!d) return "Unknown date";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function ProgressChart({ scans }) {
  const [metric, setMetric] = useState("weight");
  const sorted = [...scans].sort(
    (a, b) => (parseScanDate(a.scanDate)?.getTime() ?? 0) - (parseScanDate(b.scanDate)?.getTime() ?? 0)
  );
  if (sorted.length < 2) {
    return <div style={styles.muted}>Log at least 2 scans to view progress trends.</div>;
  }
  const configs = {
    weight: { label: "Weight", color: "#2563eb", get: (s) => num(s.weight) },
    smm: { label: "Muscle (SMM)", color: "#059669", get: (s) => num(s.smm) },
    pbf: { label: "Body Fat %", color: "#7c3aed", get: (s) => num(s.pbf) },
  };
  const config = configs[metric];
  const values = sorted.map(config.get).filter((v) => v > 0);
  if (values.length < 2) return <div style={styles.muted}>Not enough valid data.</div>;
  const minVal = Math.min(...values) * 0.95;
  const maxVal = Math.max(...values) * 1.05;
  const range = maxVal - minVal || 1;
  const width = 700;
  const height = 160;
  const padding = 30;
  const points = sorted.map((s, idx) => {
    const v = config.get(s);
    const x = padding + (idx / (sorted.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - minVal) / range) * (height - padding * 2);
    return { x, y, val: v };
  });
  const pathD = points.reduce(
    (acc, p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
    ""
  );
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  const diff = (field) => (num(latest[field]) - num(first[field])).toFixed(1);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {Object.keys(configs).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMetric(key)}
            style={metric === key ? styles.chipOn : styles.chip}
          >
            {configs[key].label}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
        <ChangeCard label="Weight" value={diff("weight")} unit="lbs" />
        <ChangeCard label="Muscle" value={diff("smm")} unit="lbs" />
        <ChangeCard label="Body Fat" value={diff("pbf")} unit="%" />
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 140 }}>
        <path d={pathD} fill="none" stroke={config.color} strokeWidth="3" />
        {points.map((p, idx) => (
          <g key={idx}>
            <circle cx={p.x} cy={p.y} r="4" fill={config.color} />
            {p.val > 0 && (
              <text x={p.x} y={p.y - 8} fontSize="10" fontWeight="700" textAnchor="middle" fill="#0f172a">
                {Number(p.val).toFixed(1)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function ChangeCard({ label, value, unit }) {
  const n = parseFloat(value);
  const up = n > 0;
  const down = n < 0;
  return (
    <div style={styles.changeCard}>
      <div style={styles.changeLabel}>{label}</div>
      <div style={{ fontWeight: 800, color: down ? "#059669" : up ? "#dc2626" : "#0f172a" }}>
        {up ? "+" : ""}
        {value} {unit}
      </div>
    </div>
  );
}

export default function InBodyScans({
  selectedMember,
  scansCompleted,
  scanPct,
  onToggleScan,
}) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedScan, setSelectedScan] = useState(null);

  useEffect(() => {
    if (!selectedMember) return;
    const email = (selectedMember.email || "").trim();
    const phone = (selectedMember.phone || "").trim();
    if (!email && !phone) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    const load = async () => {
      const seen = new Set();
      const list = [];
      const addSnap = (snap) => {
        snap.docs.forEach((d) => {
          if (seen.has(d.id)) return;
          seen.add(d.id);
          const data = d.data();
          const when = scanDateFromDoc(data);
          list.push({ id: d.id, ...data, scanDate: when ? when.toISOString() : data.scanDate });
        });
      };

      const digits = phone.replace(/\D/g, "");
      const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
      const col = collection(checkinsDb, "inbody_scans");

      if (email) {
        addSnap(await getDocs(query(col, where("email", "==", email.toLowerCase()))));
      }
      if (last10.length >= 7) {
        addSnap(await getDocs(query(col, where("phone", "==", last10))));
        if (digits !== last10) {
          addSnap(await getDocs(query(col, where("phone", "==", digits))));
        }
      }

      list.sort((a, b) => String(b.scanDate || "").localeCompare(String(a.scanDate || "")));
      if (cancelled) return;
      setScans(list);

      const next = {
        scan1: !!(selectedMember.inBodyScans?.scan1) || list.length >= 1,
        scan2: !!(selectedMember.inBodyScans?.scan2) || list.length >= 2,
        scan3: !!(selectedMember.inBodyScans?.scan3) || list.length >= 3,
      };
      const cur = selectedMember.inBodyScans || {};
      if (cur.scan1 === next.scan1 && cur.scan2 === next.scan2 && cur.scan3 === next.scan3) return;
      await updateDoc(doc(db, "members", selectedMember.id), { inBodyScans: next });
    };

    load()
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load scans");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMember?.id, selectedMember?.email, selectedMember?.phone]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={styles.sectionCard}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <h4 style={styles.h4}>12-week checklist</h4>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>
            {scansCompleted} / 3 Complete ({scanPct}%)
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {["scan1", "scan2", "scan3"].map((scanKey, idx) => {
            const isDone = selectedMember.inBodyScans?.[scanKey];
            return (
              <button
                key={scanKey}
                type="button"
                onClick={() => onToggleScan(selectedMember.id, scanKey)}
                style={isDone ? styles.scanBoxDone : styles.scanBoxPending}
              >
                {isDone ? "✓" : "○"} Scan {idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      <div style={styles.sectionCard}>
        <h4 style={styles.h4}>InBody results ({scans.length})</h4>
        {loading && <div style={styles.muted}>Loading scans…</div>}
        {error && <div style={{ ...styles.muted, color: "#dc2626" }}>{error}</div>}
        {!loading && !error && scans.length === 0 && (
          <div style={styles.muted}>No InBody scans found for this member.</div>
        )}
        {scans.length >= 2 && <ProgressChart scans={scans} />}
      </div>

      {scans.map((scan) => (
        <div key={scan.id} style={styles.scanRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>
              {formatDate(scan.scanDate)}
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14 }}>
              <span>
                <span style={styles.k}>Weight </span>
                <b>{scan.weight > 0 ? `${scan.weight} lbs` : "—"}</b>
              </span>
              <span>
                <span style={styles.k}>Muscle </span>
                <b style={{ color: "#2563eb" }}>{scan.smm > 0 ? `${scan.smm} lbs` : "—"}</b>
              </span>
              <span>
                <span style={styles.k}>Body fat </span>
                <b style={{ color: "#7c3aed" }}>{scan.pbf > 0 ? `${scan.pbf}%` : "—"}</b>
              </span>
            </div>
          </div>
          <button type="button" onClick={() => setSelectedScan(scan)} style={styles.viewBtn}>
            View sheet
          </button>
        </div>
      ))}

      {selectedScan && (
        <InBodyResultSheetModal scan={selectedScan} onClose={() => setSelectedScan(null)} />
      )}
    </div>
  );
}

const styles = {
  sectionCard: {
    backgroundColor: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 16,
  },
  h4: { margin: "0 0 10px", fontSize: 13, textTransform: "uppercase", color: "#374151" },
  muted: { fontSize: 13, color: "#64748b", textAlign: "center", padding: "12px 0" },
  scanBoxDone: {
    flex: 1,
    backgroundColor: "#dcfce7",
    color: "#15803d",
    border: "1px solid #86efac",
    padding: 10,
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
  },
  scanBoxPending: {
    flex: 1,
    backgroundColor: "#f8fafc",
    color: "#64748b",
    border: "1px solid #cbd5e1",
    padding: 10,
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 500,
    fontSize: 13,
  },
  scanRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 14,
  },
  k: { fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" },
  viewBtn: {
    background: "#dbeafe",
    color: "#1d4ed8",
    border: "none",
    borderRadius: 10,
    padding: "8px 12px",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    flexShrink: 0,
  },
  chip: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#475569",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  chipOn: {
    border: "none",
    background: "#2563eb",
    color: "#fff",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  changeCard: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 10,
    textAlign: "center",
  },
  changeLabel: { fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase" },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1200,
    padding: 16,
  },
  sheet: {
    background: "#fff",
    borderRadius: 16,
    width: "100%",
    maxWidth: 480,
    padding: 20,
    maxHeight: "90vh",
    overflow: "auto",
  },
  close: { border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#64748b" },
  metric: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 },
};