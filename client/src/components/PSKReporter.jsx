import { useEffect, useState } from "react";
import { formatDateTimeUtc, formatTimeUtc } from "../lib/time.js";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";

const FILTER_OPTIONS = [
  { value: "both", label: "All (heard you + you heard)" },
  { value: "sent", label: "Where I was heard" },
  { value: "received", label: "What I heard" }
];
/** Max reports shown in one-page layout (no scrollbars). */
const MAX_VISIBLE_REPORTS = 5;

export default function PSKReporter() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("both");

  async function load() {
    try {
      setErr(null);
      const r = await fetch(`/api/pskreporter?filter=${encodeURIComponent(filter)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = j.detail || j.error || `HTTP ${r.status}`;
        throw new Error(msg);
      }
      setData(j);
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [filter]);

  if (err) return <PanelError message={err} onRetry={load} label="PSK Reporter" />;
  if (!data) return <PanelLoading lines={5} />;

  const reports = data.reports || [];
  const callsign = data.callsign || "—";

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>Show</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            background: "rgba(255,255,255,0.08)",
            color: "white",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            outline: "none"
          }}
        >
          {FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
        <strong>{callsign}</strong> · Last 2 h.{" "}
        <a
          href="https://pskreporter.info/pskmap.html"
          target="_blank"
          rel="noreferrer"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          PSK Reporter
        </a>
      </div>
      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
        Updated: {formatDateTimeUtc(data.updated)} · {reports.length <= MAX_VISIBLE_REPORTS ? reports.length : `${MAX_VISIBLE_REPORTS} of ${reports.length}`} reports
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {reports.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, padding: 8 }}>
            No reception reports yet. Call CQ and wait a few minutes.
          </div>
        ) : (
          reports.slice(0, MAX_VISIBLE_REPORTS).map((r, i) => {
            const isHeardYou = r.direction === "heard_you";
            const otherCall = isHeardYou ? r.receiverCallsign : r.senderCallsign;
            const otherLoc = isHeardYou ? r.receiverLocator : r.senderLocator;
            return (
              <div
                key={`${otherCall}-${r.flowStartSeconds}-${i}`}
                style={{
                  padding: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.04)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontWeight: 800 }}>{otherCall || "—"}</span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 6,
                      background: isHeardYou ? "rgba(55,178,77,0.3)" : "rgba(77,171,247,0.3)",
                      color: "rgba(255,255,255,0.9)"
                    }}
                  >
                    {isHeardYou ? "Heard you" : "You heard"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>
                    {r.frequency != null ? `${(r.frequency / 1000).toFixed(2)} kHz` : "—"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginTop: 2 }}>
                  {otherLoc || "—"} · {r.mode || "—"}
                  {r.sNR != null ? ` · SNR ${r.sNR}` : ""}
                  {r.flowStartSeconds != null
                    ? ` · ${formatTimeUtc(new Date(r.flowStartSeconds * 1000).toISOString())}`
                    : ""}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
