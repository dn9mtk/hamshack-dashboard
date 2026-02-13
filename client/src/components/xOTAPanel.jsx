import { useEffect, useState, useCallback, useMemo } from "react";
import PanelError from "./PanelError.jsx";
import PanelLoading from "./PanelLoading.jsx";
import { gridCenter } from "../lib/grid.js";
import { distanceKm, bearing } from "../lib/geo.js";

const XOTA_PROGRAMS = [
  { id: "POTA", label: "POTA", sig: "POTA", url: "https://pota.app" },
  { id: "SOTA", label: "SOTA", sig: "SOTA", url: "https://sotawatch.sota.org.uk" },
  { id: "IOTA", label: "IOTA", sig: "IOTA", url: "https://www.iota-world.org" },
  { id: "COTA", label: "COTA", sig: "WCA", url: "https://www.cotapa.org" }
];

const AUTO_ADVANCE_MS = 12000;

function formatSpotTime(spotTime) {
  if (!spotTime) return null;
  try {
    const d = new Date(spotTime);
    if (!Number.isFinite(d.getTime())) return null;
    const now = Date.now();
    const diffMs = now - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return d.toUTCString().slice(0, 16);
  } catch {
    return null;
  }
}

function formatFreq(item) {
  const mhz = item.freqMhz;
  if (Number.isFinite(mhz)) {
    if (mhz >= 100) return `${mhz.toFixed(2)} MHz`;
    if (mhz >= 1) return `${mhz.toFixed(2)} MHz`;
    return `${(mhz * 1000).toFixed(1)} kHz`;
  }
  return item.frequency != null ? String(item.frequency) : "—";
}

export default function XOTAPanel({
  program = "POTA",
  onProgramChange,
  onFocusOnMap,
  locator = ""
}) {
  const prog = XOTA_PROGRAMS.find((p) => p.id === program) || XOTA_PROGRAMS[0];
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);

  async function load() {
    try {
      setErr(null);
      const r = await fetch(`/api/xota?sig=${encodeURIComponent(prog.sig)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const list = data.items || [];
      setItems(list);
      setLoaded(true);
      setIndex(0);
    } catch (e) {
      setErr(e?.message || String(e));
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [program, prog.sig]);

  useEffect(() => {
    setIndex((i) => (items.length ? Math.min(i, items.length - 1) : 0));
  }, [items.length]);

  const go = useCallback((delta) => {
    setIndex((i) => {
      if (items.length <= 1) return i;
      return (i + delta + items.length) % items.length;
    });
  }, [items.length]);

  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => go(1), AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [items.length, go]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    },
    [go]
  );

  const qth = useMemo(() => (locator && locator !== "—" ? gridCenter(locator) : null), [locator]);
  const nearestActivator = useMemo(() => {
    if (!qth || !items.length) return null;
    const withCoords = items
      .filter((x) => Number.isFinite(Number(x.latitude)) && Number.isFinite(Number(x.longitude)))
      .map((x) => ({
        ...x,
        distKm: distanceKm(qth.lat, qth.lon, Number(x.latitude), Number(x.longitude)),
        bearing: Math.round(bearing(qth.lat, qth.lon, Number(x.latitude), Number(x.longitude)))
      }))
      .sort((a, b) => a.distKm - b.distKm);
    return withCoords[0] || null;
  }, [qth, items]);

  if (err) return <PanelError message={err} onRetry={load} label={prog.label} />;
  if (!loaded && items.length === 0) return <PanelLoading lines={4} />;
  if (items.length === 0) {
    return (
      <div className="news-panel-content news-panel-slider">
        <div className="news-slider-card" style={{ minHeight: 60 }}>
          <div className="panel-empty">No {prog.label} activators spotted. Try again later.</div>
        </div>
        <div className="contests-panel-footer">
          <a href={prog.url} target="_blank" rel="noopener noreferrer" className="contests-panel-link">
            {prog.label}
          </a>
        </div>
      </div>
    );
  }

  const item = items[index];
  const hasMultiple = items.length > 1;

  const refDisplay = item?.refName ? `${item.reference || ""} ${item.refName}`.trim() : item?.reference || "—";

  const hasCoords = item && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));

  const cardContent = item ? (
    <>
      <span className="news-slider-title">
        <a
          href={`https://www.qrz.com/db/${encodeURIComponent(item.activator.replace(/\/.*$/, ""))}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "inherit", textDecoration: "none" }}
          onClick={(e) => e.stopPropagation()}
        >
          {item.activator}
        </a>
        {item.band && (
          <span style={{ marginLeft: 6, fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
            · {item.band}
          </span>
        )}
      </span>
      <span className="news-slider-date">{refDisplay}</span>
      <span className="news-slider-date" style={{ marginTop: 2 }}>
        {formatFreq(item)} · {item.mode || "—"}
      </span>
      {formatSpotTime(item.spotTime) && (
        <span className="news-slider-date" style={{ marginTop: 2, fontSize: 11 }}>
          {formatSpotTime(item.spotTime)}
        </span>
      )}
      <a
        href={prog.url}
        target="_blank"
        rel="noopener noreferrer"
        className="news-slider-hint"
        style={{ marginTop: 6 }}
        onClick={(e) => e.stopPropagation()}
      >
        {prog.label} ↗
      </a>
      {onFocusOnMap && hasCoords && (
        <button
          type="button"
          className="news-slider-btn repeaters-focus-btn"
          style={{ alignSelf: "flex-start" }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFocusOnMap({ lat: Number(item.latitude), lon: Number(item.longitude), activator: item.activator, reference: item.reference || item.refName });
          }}
          title="Center map on this activator"
        >
          Find on map
        </button>
      )}
    </>
  ) : null;

  return (
    <div className="news-panel-content news-panel-slider">
      {nearestActivator && (
        <div className="xota-nearest-block" style={{ marginBottom: 8, padding: 8, background: "rgba(32,201,151,0.12)", borderRadius: 8, border: "1px solid rgba(32,201,151,0.3)", fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 4 }}>Nearest activator</div>
          <div style={{ color: "rgba(255,255,255,0.8)" }}>
            {nearestActivator.activator} · {nearestActivator.distKm.toFixed(0)} km · {nearestActivator.bearing}°
            {nearestActivator.refName && ` · ${nearestActivator.refName}`}
          </div>
        </div>
      )}
      <div className="xota-program-toggle contests-toggle" role="group" aria-label="Select xOTA program">
        {XOTA_PROGRAMS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`contests-toggle-btn ${program === p.id ? "active" : ""}`}
            onClick={() => onProgramChange?.(p.id)}
            aria-pressed={program === p.id}
            title={p.id === "POTA" ? "Parks on the Air" : p.id === "SOTA" ? "Summits on the Air" : p.id === "IOTA" ? "Islands on the Air" : "Castles on the Air"}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="news-slider-card">
        <div className="news-slider-link" style={{ cursor: "default", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          {cardContent}
        </div>
      </div>
      {hasMultiple && (
        <div
          className="news-slider-nav"
          role="group"
          aria-label={`Navigate ${prog.label} activator`}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <div className="news-slider-nav-row">
            <button
              type="button"
              className="news-slider-btn"
              onClick={() => go(-1)}
              aria-label={`Previous ${prog.label} activator`}
            >
              &#60;
            </button>
            <span className="news-slider-counter" aria-live="polite">
              {index + 1} / {items.length}
            </span>
            <button
              type="button"
              className="news-slider-btn"
              onClick={() => go(1)}
              aria-label={`Next ${prog.label} activator`}
            >
              &#62;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
