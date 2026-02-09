import { useEffect, useState } from "react";
import { formatDateTimeUtc } from "../lib/time.js";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";

const STATUS_COLOR = { open: "#37b24d", marginal: "#f59f00", closed: "#868e96", disturbed: "#f03e3e" };

// HamClock-style: frequency scale 0–35 MHz, band markers at 7, 14, 21, 28
const MUF_SCALE_MAX_MHZ = 35;
const BAND_MARKERS = [
  { freq: 7, label: "40m" },
  { freq: 14, label: "20m" },
  { freq: 21, label: "15m" },
  { freq: 28, label: "10m" }
];

export default function Propagation() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  async function load() {
    try {
      setErr(null);
      const r = await fetch("/api/propagation");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
    } catch (e) {
      setErr(String(e));
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  if (err) return <PanelError message={err} onRetry={load} label="Propagation" />;
  if (!data) return <PanelLoading lines={5} />;

  const mufMHz = data.mufMHz != null ? Math.min(Number(data.mufMHz), MUF_SCALE_MAX_MHZ) : 0;
  const fillPercent = (mufMHz / MUF_SCALE_MAX_MHZ) * 100;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {/* MUF value */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>MUF (est.)</span>
        <span style={{ fontWeight: 800, fontSize: 18 }}>{data.mufMHz != null ? `${data.mufMHz} MHz` : "—"}</span>
      </div>

      {/* HamClock-style MUF bar: frequency scale with fill up to MUF */}
      <div style={{ display: "grid", gap: 4 }}>
        <div
          style={{
            position: "relative",
            height: 24,
            borderRadius: 8,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.14)",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${fillPercent}%`,
              borderRadius: "6px 0 0 6px",
              background: "linear-gradient(90deg, #339af0 0%, #4dabf7 100%)"
            }}
          />
        </div>
        {/* Scale labels: 0 and max */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
          <span>0</span>
          <span>{MUF_SCALE_MAX_MHZ} MHz</span>
        </div>
        {/* Band markers on the scale */}
        <div style={{ position: "relative", height: 14, marginTop: -2 }}>
          {BAND_MARKERS.map(({ freq, label }) => {
            const leftPercent = (freq / MUF_SCALE_MAX_MHZ) * 100;
            return (
              <div
                key={freq}
                style={{
                  position: "absolute",
                  left: `${leftPercent}%`,
                  transform: "translateX(-50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2
                }}
              >
                <div style={{ width: 1, height: 6, background: "rgba(255,255,255,0.4)" }} />
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
        SFI {data.sfi ?? "—"} · Kp {data.kp ?? "—"}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {(data.bands || []).map((b) => (
          <div
            key={b.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)"
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[b.status] || "#868e96" }} />
            <span style={{ fontWeight: 700, minWidth: 32 }}>{b.name}</span>
            <span style={{ color: "rgba(255,255,255,0.75)", textTransform: "capitalize" }}>{b.status}</span>
          </div>
        ))}
      </div>
      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
        Updated: {formatDateTimeUtc(data.updated)}
      </div>
      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
        Full prediction from MUF at your QTH (SFI + solar zenith).
      </div>
    </div>
  );
}
