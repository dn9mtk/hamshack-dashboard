/**
 * Digital modes – DMR/D-Star/Fusion reflector status and FT8/FT4 activity heatmap.
 * For digital users: links to reflector dashboards. Activity heatmap from PSK Reporter.
 */
import { useEffect, useState, useMemo } from "react";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";
import { freqToBand } from "../lib/freqToBand.js";

const REFLECTOR_LINKS = [
  {
    section: "DMR",
    items: [
      { url: "https://brandmeister.network/?page=lh", label: "BrandMeister Last Heard", hint: "Live DMR activity" },
      { url: "https://brandmeister.network/?page=repeaters", label: "BrandMeister Repeaters", hint: "Repeater list and status" },
      { url: "https://radioid.net/database/dms", label: "DMR-Marc", hint: "Alternative DMR network" }
    ]
  },
  {
    section: "D-Star",
    items: [
      { url: "https://status.dstargateway.org/", label: "D-Star Gateway", hint: "REF/DCS/XLX reflector status" },
      { url: "https://www.dstarreflectors.org/", label: "D-Star reflectors", hint: "Reflector directory" }
    ]
  },
  {
    section: "Fusion (YSF)",
    items: [
      { url: "https://fusion.opendmr.net/", label: "YSF reflector dashboard", hint: "Fusion status" },
      { url: "https://dvref.com/", label: "DVRef registry", hint: "DMR/YSF/NXDN reflectors" }
    ]
  }
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

  if (err && !heatmapData) return <PanelError message={err} onRetry={loadHeatmap} label="Digital" />;

  return (
    <div className="panel-content-grid">
      <div className="news-slider-card" style={{ padding: 12 }}>
        <h3 style={{ fontSize: 14, margin: "0 0 8px 0", fontWeight: 700 }}>Reflector status</h3>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 10px 0" }}>
          DMR, D-Star, Fusion – last heard and reflector dashboards
        </p>
        {REFLECTOR_LINKS.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{section}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="news-slider-link"
                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <span className="news-slider-title">{item.label}</span>
                  <span className="news-slider-date">{item.hint}</span>
                  <span className="news-slider-hint">Open ↗</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="news-slider-card" style={{ padding: 12 }}>
        <h3 style={{ fontSize: 14, margin: "0 0 8px 0", fontWeight: 700 }}>Activity heatmap</h3>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 10px 0" }}>
          {cs ? `FT8/FT4 activity for ${cs} by band and UTC hour (last ${hours === "168" ? "7 days" : hours === "72" ? "3 days" : hours + " h"})` : "Set callsign in Settings"}
        </p>
        {!cs ? (
          <div className="panel-empty-inline" style={{ padding: 8 }}>
            Configure callsign in Settings to see your activity heatmap.
          </div>
        ) : (
          <>
            <div className="spots-filters" style={{ flexWrap: "wrap", marginBottom: 8 }}>
              <div className="spots-filter">
                <label className="spots-filter-label">Mode</label>
                <select
                  className="ui-select"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  aria-label="Mode filter"
                >
                  {HEATMAP_MODES.map((o) => (
                    <option key={o.value || "all"} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="spots-filter">
                <label className="spots-filter-label">Period</label>
                <select
                  className="ui-select"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  aria-label="Time period"
                >
                  <option value="24">24 h</option>
                  <option value="72">3 days</option>
                  <option value="168">7 days</option>
                </select>
              </div>
            </div>
            {!heatmapData ? (
              <PanelLoading lines={3} />
            ) : !hasHeatmap ? (
              <div className="panel-empty-inline" style={{ padding: 8 }}>
                No {mode || "digital"} reports yet. Call CQ and wait for spots.
              </div>
            ) : (
              <div className="digital-heatmap" style={{ overflowX: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: "2px 4px", fontSize: 10, minWidth: 0 }}>
                  <div style={{ gridColumn: "2", display: "flex", gap: 1 }}>
                    {[...Array(24)].map((_, h) => (
                      <span key={h} style={{ flex: 1, textAlign: "center", color: "var(--muted)", minWidth: 10 }}>
                        {h % 6 === 0 ? h : ""}
                      </span>
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
                                background: intensity > 0
                                  ? `rgba(77,171,247,${0.2 + 0.7 * intensity})`
                                  : "rgba(255,255,255,0.04)",
                                borderRadius: 2
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
                  Rows: band · Cols: UTC hour · Hover for count
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="news-slider-card" style={{ padding: 12 }}>
        <h3 style={{ fontSize: 14, margin: "0 0 8px 0", fontWeight: 700 }}>More</h3>
        <a href="https://pskreporter.info/pskmap.html" target="_blank" rel="noreferrer" className="news-slider-link">
          PSK Reporter map
        </a>
        <a href="https://rbn.telegraphy.de/activity/" target="_blank" rel="noreferrer" className="news-slider-link">
          RBN activity (CW/RTTY)
        </a>
      </div>
    </div>
  );
}
