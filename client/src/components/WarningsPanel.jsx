/**
 * Civil protection warnings panel – NINA/Katwarn style (warnung.bund.de).
 * DWD weather, MoWaS, LHP flood, Biwapp. Slider pattern like Earthquakes.
 */
import { useEffect, useState, useCallback } from "react";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";

const SOURCE_OPTIONS = [
  { value: "", label: "All" },
  { value: "dwd", label: "DWD (Wetter)" },
  { value: "mowas", label: "MoWaS" },
  { value: "lhp", label: "LHP (Hochwasser)" },
  { value: "biwapp", label: "Biwapp" }
];

function fmtDate(str) {
  if (!str) return "—";
  try {
    const d = new Date(str);
    return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return str;
  }
}

function severityColor(s) {
  switch (s) {
    case "Severe": return "#c92a2a";
    case "Moderate": return "#f59f00";
    case "Minor": return "#51cf66";
    default: return "var(--muted)";
  }
}

export default function WarningsPanel() {
  const [warnings, setWarnings] = useState([]);
  const [sources, setSources] = useState([]);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const [sourceFilter, setSourceFilter] = useState(() => {
    try {
      return localStorage.getItem("hamshack_warnings_source") || "";
    } catch {
      return "";
    }
  });

  const load = useCallback(async () => {
    try {
      setErr(null);
      const params = sourceFilter ? new URLSearchParams({ source: sourceFilter }) : "";
      const r = await fetch(`/api/warnings${params ? `?${params}` : ""}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const list = j.warnings || [];
      setWarnings(list);
      setSources(j.sources || []);
      setIndex((i) => (list.length ? Math.min(i, list.length - 1) : 0));
    } catch (e) {
      setErr(e?.message || "Failed to load warnings");
      setWarnings([]);
    } finally {
      setLoaded(true);
    }
  }, [sourceFilter]);

  useEffect(() => {
    try {
      localStorage.setItem("hamshack_warnings_source", sourceFilter);
    } catch {}
  }, [sourceFilter]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  const go = useCallback((delta) => {
    setIndex((i) => {
      if (warnings.length <= 1) return i;
      return (i + delta + warnings.length) % warnings.length;
    });
  }, [warnings.length]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    },
    [go]
  );

  if (err) return <PanelError message={err} onRetry={load} label="Warnings" />;
  if (!loaded && warnings.length === 0) return <PanelLoading lines={4} />;

  if (warnings.length === 0) {
    return (
      <div className="panel-content-grid">
        <div className="spots-filters" role="group" aria-label="Warning source">
          <label className="spots-filter">
            <span className="spots-filter-label">Source</span>
            <select
              className="ui-select"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              aria-label="Warning source filter"
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="news-panel-content news-panel-slider">
          <div className="news-slider-card" style={{ minHeight: 60 }}>
            <div className="panel-empty">
              No civil protection warnings at the moment.
              <br />
              <span style={{ fontSize: 12, marginTop: 4, display: "block" }}>Data: warnung.bund.de (NINA, Katwarn)</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const w = warnings[index];
  const hasMultiple = warnings.length > 1;
  const sevColor = severityColor(w?.severity);

  const cardContent = w ? (
    <>
      <span
        className="news-slider-title"
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: sevColor, flexShrink: 0 }} />
        {w.title}
      </span>
      <span className="news-slider-date" style={{ marginTop: 2 }}>
        {w.sourceLabel} · {w.severity}
        {w.type === "Cancel" && " · Entwarnung"}
      </span>
      <span className="news-slider-date" style={{ marginTop: 2, fontSize: 11, color: "var(--muted)" }}>
        {w.startDate && `From ${fmtDate(w.startDate)}`}
        {w.expiresDate && ` · Until ${fmtDate(w.expiresDate)}`}
      </span>
      <span className="news-slider-hint" style={{ marginTop: 6 }}>warnung.bund.de · NINA / Katwarn</span>
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11 }}>
        {w.url && (
          <a href={w.url} target="_blank" rel="noopener noreferrer" className="news-slider-hint">
            Details auf warnung.bund.de ↗
          </a>
        )}
      </div>
    </>
  ) : null;

  return (
    <div className="panel-content-grid">
      <div className="spots-filters" role="group" aria-label="Warning source">
        <label className="spots-filter">
          <span className="spots-filter-label">Source</span>
          <select
            className="ui-select"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            aria-label="Warning source filter"
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="news-panel-content news-panel-slider">
        <div className="news-slider-card">
          <div className="news-slider-link" style={{ cursor: "default", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            {cardContent}
          </div>
        </div>
        {hasMultiple && (
          <div
            className="news-slider-nav"
            role="group"
            aria-label="Navigate warnings"
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            <div className="news-slider-nav-row">
              <button type="button" className="news-slider-btn" onClick={() => go(-1)} aria-label="Previous warning">&#60;</button>
              <span className="news-slider-counter" aria-live="polite">{index + 1} / {warnings.length}</span>
              <button type="button" className="news-slider-btn" onClick={() => go(1)} aria-label="Next warning">&#62;</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
