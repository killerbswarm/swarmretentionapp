import React, { useState } from "react";

const formatDateFull = (dateVal) => {
  if (!dateVal) return "—";
  try {
    let d = null;
    if (dateVal?.toDate) d = dateVal.toDate();
    else if (typeof dateVal === "object" && dateVal.seconds) d = new Date(dateVal.seconds * 1000);
    else d = new Date(dateVal);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

function n(v) {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtCtrl(v) {
  if (v === undefined || v === null || v === "") return "—";
  const x = parseFloat(v);
  if (!Number.isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return `${sign}${x} lbs`;
}

function Bar({ value, min, max, color = "#1e3a5f" }) {
  const pct = Math.max(0, Math.min(100, ((n(value) - min) / (max - min)) * 100));
  return (
    <div style={{ position: "relative", height: 12, background: "#e8e8e8", borderRadius: 2 }}>
      <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${pct}%`, background: "#d4d4d4", borderRadius: 2 }} />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: `calc(${pct}% - 5px)`,
          transform: "translateY(-50%)",
          width: 0,
          height: 0,
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: `8px solid ${color}`,
        }}
      />
    </div>
  );
}

function Cell({ label, value, unit, wide }) {
  return (
    <div style={{ border: "1px solid #cfcfcf", padding: "6px 8px", gridColumn: wide ? "span 2" : "auto" }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", color: "#666" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800 }}>
        {value || value === 0 ? value : "—"}
        {unit ? <span style={{ fontSize: 10, fontWeight: 400, color: "#666", marginLeft: 4 }}>{unit}</span> : null}
      </div>
    </div>
  );
}

function kgToLb(v) {
  return Math.round(n(v) * 2.20462 * 10) / 10;
}

function SegRow({ label, lbs, pct, min = 70, max = 160 }) {
  const shown = n(lbs);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "88px 1fr 64px", alignItems: "center", gap: 8, padding: "4px 0" }}>
      <div style={{ fontSize: 11 }}>{label}</div>
      <Bar value={n(pct) || 0} min={min} max={max} color="#b91c1c" />
      <div style={{ textAlign: "right", fontSize: 11, fontWeight: 700 }}>
        {shown ? `${shown.toFixed(2)} lb` : "—"}
        {n(pct) ? <div style={{ fontSize: 9, color: "#666", fontWeight: 400 }}>{n(pct)}%</div> : null}
      </div>
    </div>
  );
}

export default function InBodyResultSheetModal({ scan, onClose }) {
  if (!scan) return null;

  const w = n(scan.weight);
  const smm = n(scan.smm);
  const bfm = n(scan.bfm);
  const pbf = n(scan.pbf);
  const bmi = n(scan.bmi);
  const tbw = n(scan.tbw);
  const dlm = n(scan.dlm);
  const lbm = n(scan.lbm);
  const bmr = n(scan.bmr);
  const visceral = n(scan.visceralFat);
  const icw = n(scan.icw);
  const ecw = n(scan.ecw);
  const ecwTbw = n(scan.ecwTbw);
  const raw = scan.rawApi || {};
  const seg = scan.segmentalLean || {};
  const segPct = scan.segmentalLeanPct || {};
  const fat = scan.segmentalFat || {};
  const fatPct = scan.segmentalFatPct || {};

  const pctOrRaw = (stored, rawVal) => {
    const s = n(stored);
    const r = n(rawVal);
    if (s >= 50) return s;
    if (r >= 50) return r;
    return r || 0;
  };

  const massLb = (stored, rawKg) => {
    const fromRaw = n(rawKg) ? kgToLb(rawKg) : 0;
    const s = n(stored);
    if (fromRaw) return fromRaw;
    return s;
  };

  const lean = {
    rightArm: massLb(seg.rightArm, raw.LBMofRightArm),
    leftArm: massLb(seg.leftArm, raw.LBMofLeftArm),
    trunk: massLb(seg.trunk, raw.LBMofTrunk),
    rightLeg: massLb(seg.rightLeg, raw.LBMofRightLeg),
    leftLeg: massLb(seg.leftLeg, raw.LBMofLeftLeg),
  };
  const leanPct = {
    rightArm: pctOrRaw(segPct.rightArm, raw["LBM%ofRightArm"]),
    leftArm: pctOrRaw(segPct.leftArm, raw["LBM%ofLeftArm"]),
    trunk: pctOrRaw(segPct.trunk, raw["LBM%ofTrunk"]),
    rightLeg: pctOrRaw(segPct.rightLeg, raw["LBM%ofRightLeg"]),
    leftLeg: pctOrRaw(segPct.leftLeg, raw["LBM%ofLeftLeg"]),
  };
  const fatLb = {
    rightArm: massLb(fat.rightArm, raw.BFMofRightArm),
    leftArm: massLb(fat.leftArm, raw.BFMofLeftArm),
    trunk: massLb(fat.trunk, raw.BFMofTrunk),
    rightLeg: massLb(fat.rightLeg, raw.BFMofRightLeg),
    leftLeg: massLb(fat.leftLeg, raw.BFMofLeftLeg),
  };
  const fatP = {
    rightArm: pctOrRaw(fatPct.rightArm, raw["BFM%ofRightArm"]),
    leftArm: pctOrRaw(fatPct.leftArm, raw["BFM%ofLeftArm"]),
    trunk: pctOrRaw(fatPct.trunk, raw["BFM%ofTrunk"]),
    rightLeg: pctOrRaw(fatPct.rightLeg, raw["BFM%ofRightLeg"]),
    leftLeg: pctOrRaw(fatPct.leftLeg, raw["BFM%ofLeftLeg"]),
  };
  const type = scan.inBodyType || scan.deviceSerial || "";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        padding: 12,
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div style={{ width: "100%", maxWidth: 960, margin: "16px 0" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "8px 16px", fontSize: 12, fontWeight: 800, borderRadius: 8, border: "none", background: "#fff", cursor: "pointer" }}
          >
            Close
          </button>
        </div>

        <div style={{ background: "#fff", color: "#111", boxShadow: "0 25px 50px rgba(0,0,0,0.35)", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "16px 20px 8px", borderBottom: "2px solid #c8102e" }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#c8102e" }}>InBody</div>
              <div style={{ fontSize: 11, color: "#666" }}>{scan.clientName || "Member"}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#444" }}>
              [{type ? `InBody ${type}` : "InBody"}]
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid #ddd", fontSize: 11 }}>
            <div style={{ padding: "8px 12px", borderRight: "1px solid #eee" }}>
              <div style={{ color: "#888", fontSize: 9, textTransform: "uppercase" }}>ID</div>
              <div style={{ fontWeight: 800 }}>{scan.phone || scan.memberId || "—"}</div>
            </div>
            <div style={{ padding: "8px 12px", borderRight: "1px solid #eee" }}>
              <div style={{ color: "#888", fontSize: 9, textTransform: "uppercase" }}>Height</div>
              <div style={{ fontWeight: 800 }}>{scan.height || "—"}</div>
            </div>
            <div style={{ padding: "8px 12px", borderRight: "1px solid #eee" }}>
              <div style={{ color: "#888", fontSize: 9, textTransform: "uppercase" }}>Age / Sex</div>
              <div style={{ fontWeight: 800 }}>
                {scan.age || "—"} {scan.gender ? `/ ${scan.gender}` : ""}
              </div>
            </div>
            <div style={{ padding: "8px 12px" }}>
              <div style={{ color: "#888", fontSize: 9, textTransform: "uppercase" }}>Test Date / Time</div>
              <div style={{ fontWeight: 800 }}>{formatDateFull(scan.scanDate)}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr" }}>
            <div style={{ padding: 16, borderRight: "1px solid #eee" }}>
              <h3 style={h3}>Body Composition Analysis</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                <Cell label="ICW" value={icw || "—"} unit="lbs" />
                <Cell label="ECW" value={ecw || "—"} unit="lbs" />
                <Cell label="TBW" value={tbw || "—"} unit="lbs" wide />
                <Cell label="Dry Lean" value={dlm || "—"} unit="lbs" />
                <Cell label="Body Fat" value={bfm || "—"} unit="lbs" />
                <Cell label="Lean Mass" value={lbm || "—"} unit="lbs" />
                <Cell label="Weight" value={w || "—"} unit="lbs" />
              </div>

              <h3 style={{ ...h3, marginTop: 16 }}>Muscle-Fat Analysis</h3>
              <MetricBar label="Weight" value={w} unit="lbs" min={80} max={280} />
              <MetricBar label="SMM" value={smm} unit="lbs" min={30} max={130} color="#1d4ed8" />
              <MetricBar label="Body Fat Mass" value={bfm} unit="lbs" min={5} max={120} color="#7c3aed" />

              <h3 style={{ ...h3, marginTop: 16 }}>Obesity Analysis</h3>
              <MetricBar label="BMI" value={bmi} min={10} max={50} />
              <MetricBar label="PBF" value={pbf} unit="%" min={5} max={55} color="#7c3aed" />

              <h3 style={{ ...h3, marginTop: 16 }}>Segmental Lean Analysis</h3>
              <SegRow label="Right Arm" lbs={lean.rightArm} pct={leanPct.rightArm} min={55} max={205} />
              <SegRow label="Left Arm" lbs={lean.leftArm} pct={leanPct.leftArm} min={55} max={205} />
              <SegRow label="Trunk" lbs={lean.trunk} pct={leanPct.trunk} min={70} max={170} />
              <SegRow label="Right Leg" lbs={lean.rightLeg} pct={leanPct.rightLeg} min={70} max={170} />
              <SegRow label="Left Leg" lbs={lean.leftLeg} pct={leanPct.leftLeg} min={70} max={170} />

              <h3 style={{ ...h3, marginTop: 16 }}>ECW/TBW Analysis</h3>
              <MetricBar label="ECW/TBW" value={ecwTbw} min={0.33} max={0.43} color="#0f766e" />
            </div>

            <div style={{ padding: 16, background: "#fafafa" }}>
              <h3 style={h3}>Body Fat - Lean Body Mass Control</h3>
              <div style={{ fontSize: 12, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Body Fat Mass</span>
                  <b>{fmtCtrl(scan.bfmControl)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Lean Body Mass</span>
                  <b>{fmtCtrl(scan.lbmControl ?? scan.rawApi?.LBMControl)}</b>
                </div>
              </div>

              <h3 style={h3}>Segmental Fat Analysis</h3>
              <SegRow label="Right Arm" lbs={fatLb.rightArm} pct={fatP.rightArm} min={50} max={200} />
              <SegRow label="Left Arm" lbs={fatLb.leftArm} pct={fatP.leftArm} min={50} max={200} />
              <SegRow label="Trunk" lbs={fatLb.trunk} pct={fatP.trunk} min={50} max={220} />
              <SegRow label="Right Leg" lbs={fatLb.rightLeg} pct={fatP.rightLeg} min={50} max={200} />
              <SegRow label="Left Leg" lbs={fatLb.leftLeg} pct={fatP.leftLeg} min={50} max={200} />

              <div style={{ border: "1px solid #ddd", padding: 12, marginTop: 16 }}>
                <div style={{ fontSize: 9, textTransform: "uppercase", color: "#888" }}>Basal Metabolic Rate</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>
                  {bmr || "—"} <span style={{ fontSize: 14 }}>kcal</span>
                </div>
              </div>
              <div style={{ border: "1px solid #ddd", padding: 12, marginTop: 12 }}>
                <div style={{ fontSize: 9, textTransform: "uppercase", color: "#888" }}>Visceral Fat Level</div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>{visceral || "—"}</div>
                <Bar value={visceral} min={1} max={20} color="#c8102e" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBar({ label, value, unit, min, max, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
        <span>{label}</span>
        <b>
          {value || "—"} {unit || ""}
        </b>
      </div>
      <Bar value={value} min={min} max={max} color={color} />
    </div>
  );
}

const h3 = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#c8102e",
  margin: "0 0 8px",
};