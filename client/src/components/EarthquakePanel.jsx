/**
 * Earthquake panel – USGS feed, slider pattern like Aircraft.
 * Filters: magnitude (2.5+, 4.5+, all), period (24h, 7 days).
 * Closest earthquake block and Find on map analogous to xOTA.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";
import { gridCenter } from "../lib/grid.js";
import { distanceKm, bearing } from "../lib/geo.js";

const MAG_OPTIONS = [
  { value: "2.5", label: "M 2.5+" },
  { value: "4.5", label: "M 4.5+" },
  { value: "all", label: "All" }
];
const PERIOD_OPTIONS = [
  { value: "day", label: "24 h" },
  { value: "week", label: "7 days" }
];

const FILTER_STORAGE_KEY = "hamshack_earthquake_filters";

function loadFilters() {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return { mag: "2.5", period: "week" };
    const j = JSON.parse(raw);
    return {
      mag: ["2.5", "4.5", "all"].includes(j.mag) ? j.mag : "2.5",
      period: ["day", "week"].includes(j.period) ? j.period : "week"
    };
  } catch {
    return { mag: "2.5", period: "week" };
  }
}

function saveFilters(filters) {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch {}
}

function fmt(val, def = "—") {
  return val != null && val !== "" ? String(val) : def;
}

function fmtMag(m) {
  if (m == null || !Number.isFinite(m)) return "—";
  return `M ${m.toFixed(1)}`;
}

function fmtTime(ts) {
  if (ts == null || !Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)} min ago`;
  if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)} h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function EarthquakePanel({ mag, period, onMagChange, onPeriodChange, locator = "", onFocusOnMap }) {
  const [earthquakes, setEarthquakes] = useState([]);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);

  const filters = useMemo(() => ({ mag: mag ?? loadFilters().mag, period: period ?? loadFilters().period }), [mag, period]);

  const qth = useMemo(() => (locator && locator !== "—" ? gridCenter(locator) : null), [locator]);
  const closestEarthquake = useMemo(() => {
    if (!qth || !earthquakes.length) return null;
    const withDist = earthquakes
      .filter((x) => Number.isFinite(Number(x.latitude)) && Number.isFinite(Number(x.longitude)))
      .map((x) => ({
        ...x,
        distKm: distanceKm(qth.lat, qth.lon, Number(x.latitude), Number(x.longitude)),
        bearing: Math.round(bearing(qth.lat, qth.lon, Number(x.latitude), Number(x.longitude)))
      }))
      .sort((a, b) => a.distKm - b.distKm);
    return withDist[0] || null;
  }, [qth, earthquakes]);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const params = new URLSearchParams({ mag: filters.mag, period: filters.period });
      const r = await fetch(`/api/earthquakes?${params}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const list = j.earthquakes || [];
      setEarthquakes(list);
      setIndex((i) => (list.length ? Math.min(i, list.length - 1) : 0));
    } catch (e) {
      setErr(e?.message || "Failed to load earthquakes");
      setEarthquakes([]);
    } finally {
      setLoaded(true);
    }
  }, [filters.mag, filters.period]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60_000); // 5 min
    return () => clearInterval(id);
  }, [load]);

  const go = useCallback((delta) => {
    setIndex((i) => {
      if (earthquakes.length <= 1) return i;
      return (i + delta + earthquakes.length) % earthquakes.length;
    });
  }, [earthquakes.length]);

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

  function handleMagChange(e) {
    const v = e.target.value;
    if (["2.5", "4.5", "all"].includes(v)) {
      saveFilters({ ...filters, mag: v });
      onMagChange?.(v);
    }
  }

  function handlePeriodChange(e) {
    const v = e.target.value;
    if (["day", "week"].includes(v)) {
      saveFilters({ ...filters, period: v });
      onPeriodChange?.(v);
    }
  }

  if (err) return <PanelError message={err} onRetry={load} label="Earthquakes" />;
  if (!loaded && earthquakes.length === 0) return <PanelLoading lines={4} />;

  if (earthquakes.length === 0) {
    return (
      <div className="panel-content-grid">
        <div className="spots-filters" role="group" aria-label="Earthquake filters">
          <label className="spots-filter">
            <span className="spots-filter-label">Magnitude</span>
            <select className="ui-select" value={filters.mag} onChange={handleMagChange} aria-label="Minimum magnitude">
              {MAG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="spots-filter">
            <span className="spots-filter-label">Period</span>
            <select className="ui-select" value={filters.period} onChange={handlePeriodChange} aria-label="Time period">
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="news-panel-content news-panel-slider">
          <div className="news-slider-card" style={{ minHeight: 60 }}>
            <div className="panel-empty">No earthquakes in selected period. Try a longer period or lower magnitude.</div>
          </div>
        </div>
      </div>
    );
  }

  const eq = earthquakes[index];
  const hasMultiple = earthquakes.length > 1;
  const hasCoords = eq && Number.isFinite(Number(eq.latitude)) && Number.isFinite(Number(eq.longitude));
  const usgsUrl = eq?.url || null;

  const cardContent = eq ? (
    <>
      <span className="news-slider-title">{fmtMag(eq.magnitude)} · {fmt(eq.place)}</span>
      <span className="news-slider-date" style={{ marginTop: 2 }}>
        {fmtTime(eq.time)} · Depth {eq.depth != null ? `${Math.round(eq.depth)} km` : "—"}
      </span>
      {eq.tsunami && (
        <span className="news-slider-date" style={{ marginTop: 2, color: "#f59f00", fontWeight: 600 }}>Tsunami watch</span>
      )}
      <span className="news-slider-hint" style={{ marginTop: 6 }}>USGS · {filters.period === "day" ? "Past 24 h" : "Past 7 days"}</span>
      {onFocusOnMap && hasCoords && (
        <button
          type="button"
          className="news-slider-btn repeaters-focus-btn"
          style={{ alignSelf: "flex-start", marginTop: 8 }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFocusOnMap({ lat: Number(eq.latitude), lon: Number(eq.longitude), id: eq.id, magnitude: eq.magnitude, place: eq.place });
          }}
          title="Center map on this earthquake"
        >
          Find on map
        </button>
      )}
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11 }}>
        {usgsUrl && <a href={usgsUrl} target="_blank" rel="noopener noreferrer" className="news-slider-hint">USGS event ↗</a>}
      </div>
    </>
  ) : null;

  return (
    <div className="panel-content-grid">
      {closestEarthquake && (
        <div className="earthquake-closest-block" style={{ marginBottom: 8, padding: 8, background: "rgba(220,53,69,0.12)", borderRadius: 8, border: "1px solid rgba(220,53,69,0.35)", fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 4 }}>Closest earthquake</div>
          <div style={{ color: "rgba(255,255,255,0.85)" }}>
            {fmtMag(closestEarthquake.magnitude)} · {closestEarthquake.distKm.toFixed(0)} km · {closestEarthquake.bearing}° Azimuth
            {" · "}{fmt(closestEarthquake.place)}
          </div>
        </div>
      )}
      <div className="spots-filters" role="group" aria-label="Earthquake filters">
        <label className="spots-filter">
          <span className="spots-filter-label">Magnitude</span>
          <select className="ui-select" value={filters.mag} onChange={handleMagChange} aria-label="Minimum magnitude">
            {MAG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="spots-filter">
          <span className="spots-filter-label">Period</span>
          <select className="ui-select" value={filters.period} onChange={handlePeriodChange} aria-label="Time period">
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
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
            aria-label="Navigate earthquakes"
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            <div className="news-slider-nav-row">
              <button type="button" className="news-slider-btn" onClick={() => go(-1)} aria-label="Previous earthquake">&#60;</button>
              <span className="news-slider-counter" aria-live="polite">{index + 1} / {earthquakes.length}</span>
              <button type="button" className="news-slider-btn" onClick={() => go(1)} aria-label="Next earthquake">&#62;</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
