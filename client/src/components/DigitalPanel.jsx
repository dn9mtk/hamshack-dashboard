/**
 * Digital modes – DMR/D-Star/Fusion reflector links and FT8/FT4 activity heatmap.
 * One item per card (like DXpeditions).
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";
import { freqToBand } from "../lib/freqToBand.js";

/** Flat list of link items – one per card. */
const LINK_ITEMS = [
  { url: "https://brandmeister.network/?page=lh", label: "BrandMeister Last Heard", hint: "Live DMR activity", section: "DMR" },
  { url: "https://brandmeister.network/?page=repeaters", label: "BrandMeister Repeaters", hint: "Repeater list and status", section: "DMR" },
  { url: "https://radioid.net/database/dms", label: "DMR-Marc", hint: "Alternative DMR network", section: "DMR" },
  { url: "https://status.dstargateway.org/", label: "D-Star Gateway", hint: "REF/DCS/XLX reflector status", section: "D-Star" },
  { url: "https://www.dstarreflectors.org/", label: "D-Star reflectors", hint: "Reflector directory", section: "D-Star" },
  { url: "https://fusion.opendmr.net/", label: "YSF reflector dashboard", hint: "Fusion status", section: "Fusion (YSF)" },
  { url: "https://dvref.com/", label: "DVRef registry", hint: "DMR/YSF/NXDN reflectors", section: "Fusion (YSF)" },
  { url: "https://pskreporter.info/pskmap.html", label: "PSK Reporter map", hint: "FT8/FT4 worldwide map", section: null },
  { url: "https://rbn.telegraphy.de/activity/", label: "RBN activity", hint: "CW/RTTY spots", section: null }
];

const HEATMAP_MODES = [
  { value: "FT8", label: "FT8" },
  { value: "FT4", label: "FT4" },
  { value: "", label: "All digital" }
];

const BAND_ORDER = ["160m", "80m", "60m", "40m", "30m", "20m", "17m", "15m", "12m", "10m", "6m", "2m", "70cm", "other"];

function bandFromFreq(freqHz) {
  const mhz = freqHz != null ? Number(freqHz) / 1e6 : null;
  const b = freqToBand(mhz);
  if (!b) return "other";
  return b.replace(/\s*m\b/, "m").replace(/\s*cm\b/, "cm");
}

export default function DigitalPanel({ callsign = "" }) {
  const [heatmapData, setHeatmapData] = useState(null);
  const [err, setErr] = useState(null);
  const [mode, setMode] = useState("FT8");
  const [hours, setHours] = useState("168");
  const [index, setIndex] = useState(0);

  const cs = (callsign || "").trim().toUpperCase();

  async function loadHeatmap() {
    if (!cs) {
      setHeatmapData(null);
      return;
    }
    try {
      setErr(null);
      const params = new URLSearchParams({
        filter: "both",
        hours,
        limit: "500"
      });
      if (mode) params.set("mode", mode);
      const r = await fetch(`/api/pskreporter?${params}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = j.detail || j.error || `HTTP ${r.status}`;
        throw new Error(msg);
      }
      setHeatmapData(j);
    } catch (e) {
      setErr(String(e?.message || e));
      setHeatmapData(null);
    }
  }

  useEffect(() => {
    loadHeatmap();
    const id = setInterval(loadHeatmap, 300_000);
    return () => clearInterval(id);
  }, [cs, mode, hours]);

  const { grid, maxCount } = useMemo(() => {
    const reports = heatmapData?.reports || [];
    if (!reports.length) return { grid: {}, maxCount: 0 };

    const g = {};
    let max = 0;
    for (const r of reports) {
      const band = bandFromFreq(r.frequency);
      const ts = r.flowStartSeconds;
      if (ts == null) continue;
      const d = new Date(ts * 1000);
      const hour = d.getUTCHours();
      const dow = d.getUTCDay();
      const key = `${band}|${dow}|${hour}`;
      g[key] = (g[key] || 0) + 1;
      if (g[key] > max) max = g[key];
      const keyDay = `${band}|${dow}`;
      g[keyDay] = (g[keyDay] || 0) + 1;
      if (g[keyDay] > max) max = g[keyDay];
    }
    return { grid: g, maxCount: max };
  }, [heatmapData]);

  const heatmapByBandHour = useMemo(() => {
    const rows = [];
    for (const band of BAND_ORDER) {
      const cells = [];
      for (let h = 0; h < 24; h++) {
        let total = 0;
        for (let d = 0; d < 7; d++) {
          total += grid[`${band}|${d}|${h}`] || 0;
        }
        cells.push(total);
      }
      if (cells.some((c) => c > 0)) rows.push({ band, cells });
    }
    return rows;
  }, [grid]);

  const hasHeatmap = heatmapByBandHour.length > 0 && maxCount > 0;
  const heatmapError = err && !heatmapData;

  const items = useMemo(() => [
    ...LINK_ITEMS.map((it) => ({ type: "link", ...it })),
    { type: "heatmap", label: "Activity heatmap" }
  ], []);

  const idx = Math.min(index, Math.max(0, items.length - 1));
  const item = items[idx];
  const hasMultiple = items.length > 1;

  const go = useCallback((delta) => {
    setIndex((i) => {
      if (items.length <= 1) return i;
      return (i + delta + items.length) % items.length;
    });
  }, [items.length]);

  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => go(1), 12_000);
    return () => clearInterval(t);
  }, [items.length, go]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    },
    [go]
  );

  const cardContent = item?.type === "link" ? (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="news-slider-link"
    >
      {item.section && (
        <span className="news-slider-date" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11 }}>{item.section}</span>
      )}
      <span className="news-slider-title">{item.label}</span>
      <span className="news-slider-date">{item.hint}</span>
      <span className="news-slider-hint">Open ↗</span>
    </a>
  ) : item?.type === "heatmap" ? (
    <div style={{ padding: 12 }}>
      <span className="news-slider-title" style={{ display: "block", marginBottom: 4 }}>Activity heatmap</span>
      <span className="news-slider-date" style={{ display: "block", marginBottom: 8 }}>
        {cs ? `FT8/FT4 activity for ${cs} (last ${hours === "168" ? "7 days" : hours === "72" ? "3 days" : hours + " h"})` : "Set callsign in Settings"}
      </span>
      {heatmapError ? (
        <PanelError message={err} onRetry={loadHeatmap} label="Heatmap" />
      ) : !cs ? (
        <div className="panel-empty-inline" style={{ padding: 8 }}>Configure callsign in Settings to see your activity heatmap.</div>
      ) : (
        <>
          <div className="spots-filters" style={{ flexWrap: "wrap", marginBottom: 8 }}>
            <div className="spots-filter">
              <label className="spots-filter-label">Mode</label>
              <select className="ui-select" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode filter">
                {HEATMAP_MODES.map((o) => (
                  <option key={o.value || "all"} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="spots-filter">
              <label className="spots-filter-label">Period</label>
              <select className="ui-select" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Time period">
                <option value="24">24 h</option>
                <option value="72">3 days</option>
                <option value="168">7 days</option>
              </select>
            </div>
          </div>
          {!heatmapData ? (
            <PanelLoading lines={3} />
          ) : !hasHeatmap ? (
            <div className="panel-empty-inline" style={{ padding: 8 }}>No {mode || "digital"} reports yet. Call CQ and wait for spots.</div>
          ) : (
            <div className="digital-heatmap" style={{ overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: "2px 4px", fontSize: 10, minWidth: 0 }}>
                <div style={{ gridColumn: "2", display: "flex", gap: 1 }}>
                  {[...Array(24)].map((_, h) => (
                    <span key={h} style={{ flex: 1, textAlign: "center", color: "var(--muted)", minWidth: 10 }}>{h % 6 === 0 ? h : ""}</span>
                  ))}
                </div>
                {heatmapByBandHour.map(({ band, cells }) => (
                  <div key={band} style={{ display: "contents" }}>
                    <span style={{ color: "var(--muted)", alignSelf: "center" }}>{band}</span>
                    <div style={{ display: "flex", gap: 1 }}>
                      {cells.map((cnt, h) => {
                        const intensity = maxCount > 0 ? cnt / maxCount : 0;
                        return (
                          <div
                            key={h}
                            title={`${band} UTC ${h}:00 – ${cnt} spots`}
                            style={{
                              flex: 1,
                              minWidth: 8,
                              height: 14,
                              background: intensity > 0 ? `rgba(77,171,247,${0.2 + 0.7 * intensity})` : "rgba(255,255,255,0.04)",
                              borderRadius: 2
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>Rows: band · Cols: UTC hour · Hover for count</div>
            </div>
          )}
        </>
      )}
    </div>
  ) : null;

  return (
    <div className="news-panel-content news-panel-slider">
      <div className="news-slider-card">
        {cardContent}
      </div>
      {hasMultiple && (
        <div
          className="news-slider-nav"
          role="group"
          aria-label="Navigate digital panel"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <div className="news-slider-nav-row">
            <button type="button" className="news-slider-btn" onClick={() => go(-1)} aria-label="Previous">&#60;</button>
            <span className="news-slider-counter" aria-live="polite">
              {idx + 1} / {items.length} {item?.type === "link" ? `· ${item.label}` : "· Activity heatmap"}
            </span>
            <button type="button" className="news-slider-btn" onClick={() => go(1)} aria-label="Next">&#62;</button>
          </div>
        </div>
      )}
    </div>
  );
}
