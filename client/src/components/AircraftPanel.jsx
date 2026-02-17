/**
 * Aircraft panel – radius control and flight list within configurable radius around QTH.
 * Uses OpenSky ADS-B data. Slider pattern like Contests, DXpeditions, Spots.
 * Closest aircraft block and Find on map analogous to xOTA.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";
import { gridCenter } from "../lib/grid.js";
import { distanceKm, bearing } from "../lib/geo.js";
import { getAirportName } from "../lib/airports.js";

const RADIUS_STORAGE_KEY = "hamshack_aircraft_radius_km";
const RADIUS_MIN = 5;
const RADIUS_MAX = 100;
const RADIUS_OPTIONS = [5, 10, 12, 15, 20, 25, 50, 100];

function radiusOptions(current) {
  if (RADIUS_OPTIONS.includes(current)) return RADIUS_OPTIONS;
  return [...new Set([current, ...RADIUS_OPTIONS])].sort((a, b) => a - b);
}
function loadRadius() {
  try {
    const v = parseInt(localStorage.getItem(RADIUS_STORAGE_KEY), 10);
    return Number.isFinite(v) && v >= RADIUS_MIN && v <= RADIUS_MAX ? v : 12;
  } catch {
    return 12;
  }
}

function saveRadius(km) {
  try {
    localStorage.setItem(RADIUS_STORAGE_KEY, String(km));
  } catch {}
}

function fmt(val, def = "—") {
  return val != null && val !== "" ? String(val) : def;
}

function fmtAlt(m) {
  if (m == null || !Number.isFinite(m)) return "—";
  return `${Math.round(m)} m`;
}

function fmtSpd(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return `${Math.round(ms * 1.944)} kt`;
}

function fmtType(typecode, model) {
  const tc = typecode != null && typecode !== "" ? String(typecode) : null;
  const md = model != null && model !== "" ? String(model) : null;
  if (tc && md && tc !== md) return `${tc} / ${md}`;
  return tc || md || "—";
}

export default function AircraftPanel({ radiusKm, onRadiusChange, locator = "", onFocusOnMap }) {
  const [aircraft, setAircraft] = useState([]);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const [routeData, setRouteData] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const radius = radiusKm ?? loadRadius();

  const qth = useMemo(() => (locator && locator !== "—" ? gridCenter(locator) : null), [locator]);
  const closestAircraft = useMemo(() => {
    if (!qth || !aircraft.length) return null;
    const withDist = aircraft
      .filter((x) => Number.isFinite(Number(x.latitude)) && Number.isFinite(Number(x.longitude)))
      .map((x) => ({
        ...x,
        distKm: distanceKm(qth.lat, qth.lon, Number(x.latitude), Number(x.longitude)),
        bearing: Math.round(bearing(qth.lat, qth.lon, Number(x.latitude), Number(x.longitude)))
      }))
      .sort((a, b) => a.distKm - b.distKm);
    return withDist[0] || null;
  }, [qth, aircraft]);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const r = await fetch(`/api/aircraft?radiusKm=${encodeURIComponent(radius)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const list = j.aircraft || [];
      setAircraft(list);
      setIndex((i) => (list.length ? Math.min(i, list.length - 1) : 0));
    } catch (e) {
      setErr(e?.message || "Failed to load aircraft");
      setAircraft([]);
    } finally {
      setLoaded(true);
    }
  }, [radius]);

  useEffect(() => {
    load();
    const id = setInterval(load, 12_000);
    return () => clearInterval(id);
  }, [load]);

  const go = useCallback((delta) => {
    setIndex((i) => {
      if (aircraft.length <= 1) return i;
      return (i + delta + aircraft.length) % aircraft.length;
    });
  }, [aircraft.length]);

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

  const currentIcao24 = aircraft[index]?.icao24;
  useEffect(() => {
    setRouteData(null);
    setRouteLoading(false);
  }, [currentIcao24]);

  function handleRadiusChange(e) {
    const val = parseInt(e.target.value, 10);
    if (Number.isFinite(val) && val >= RADIUS_MIN && val <= RADIUS_MAX) {
      saveRadius(val);
      onRadiusChange?.(val);
    }
  }

  if (err) return <PanelError message={err} onRetry={load} label="Aircraft" />;
  if (!loaded && aircraft.length === 0) return <PanelLoading lines={4} />;

  if (aircraft.length === 0) {
    return (
      <div className="panel-content-grid">
        <div className="spots-filters" role="group" aria-label="Aircraft radius">
          <label className="spots-filter">
            <span className="spots-filter-label">Radius (km)</span>
            <select
              className="ui-select"
              value={radius}
              onChange={handleRadiusChange}
              aria-label="Aircraft radius in kilometers"
            >
              {radiusOptions(radius).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="news-panel-content news-panel-slider">
          <div className="news-slider-card" style={{ minHeight: 60 }}>
            <div className="panel-empty">No aircraft within {radius} km. Try a larger radius.</div>
          </div>
        </div>
      </div>
    );
  }

  const a = aircraft[index];
  const hasMultiple = aircraft.length > 1;

  const hasCoords = a && Number.isFinite(Number(a.latitude)) && Number.isFinite(Number(a.longitude));

  const call = fmt(a?.callsign, a?.icao24 || "—");
  const faUrl = call !== "—" ? `https://flightaware.com/live/flight/${encodeURIComponent(call)}` : null;
  const fr24Url = call !== "—" ? `https://www.flightradar24.com/${encodeURIComponent(call)}` : null;
  const wikiQuery = (a?.model || a?.typecode || "").trim();

  const cardContent = a ? (
    <>
      <span className="news-slider-title">{fmt(a.callsign, a.icao24 || "—")}</span>
      <span className="news-slider-date" style={{ marginTop: 2 }}>
        {fmtType(a.typecode, a.model)} · {fmt(a.operator)} · {fmt(a.registration)}
      </span>
      {(a.manufacturer || a.owner || a.built) && (
        <span className="news-slider-date" style={{ marginTop: 2, fontSize: 11, color: "var(--muted)" }}>
          {[a.manufacturer, a.owner, a.built].filter(Boolean).join(" · ")}
        </span>
      )}
      <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>{fmt(a.origin_country)}</span>
        <span>{fmtAlt(a.baro_altitude)}</span>
        <span>{fmtSpd(a.velocity)}</span>
        <span>{a.true_track != null ? `${Math.round(a.true_track)}°` : "—"}</span>
        {a.on_ground && <span style={{ color: "#ffb74d" }}>GND</span>}
      </div>
      {routeData && (routeData.origin || routeData.destination) ? (
        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
          <span title={getAirportName(routeData.origin) || undefined}>{routeData.origin || "—"}</span>
          {" → "}
          <span title={getAirportName(routeData.destination) || undefined}>{routeData.destination || "—"}</span>
          {routeData.airline && ` · ${routeData.airline}`}
        </div>
      ) : (
        <button
          type="button"
          className="news-slider-btn repeaters-focus-btn"
          style={{ alignSelf: "flex-start" }}
          disabled={routeLoading}
          onClick={async () => {
            const c = a.callsign || a.icao24;
            if (!c) return;
            setRouteLoading(true);
            try {
              const r = await fetch(`/api/aircraft/flight-info?flight_icao=${encodeURIComponent(c)}`);
              const data = r.ok ? await r.json() : null;
              setRouteData(data);
            } catch {
              setRouteData(null);
            } finally {
              setRouteLoading(false);
            }
          }}
        >
          {routeLoading ? "Loading…" : "Load flight route"}
        </button>
      )}
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11 }}>
        {faUrl && <a href={faUrl} target="_blank" rel="noopener noreferrer" className="news-slider-hint">FlightAware ↗</a>}
        {fr24Url && <a href={fr24Url} target="_blank" rel="noopener noreferrer" className="news-slider-hint">FlightRadar24 ↗</a>}
        {wikiQuery && <a href={`https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(wikiQuery)}`} target="_blank" rel="noopener noreferrer" className="news-slider-hint">Wikipedia</a>}
      </div>
      <span className="news-slider-hint" style={{ marginTop: 6 }}>Within {radius} km · OpenSky ADS-B</span>
      {onFocusOnMap && hasCoords && (
        <button
          type="button"
          className="news-slider-btn repeaters-focus-btn"
          style={{ alignSelf: "flex-start", marginTop: 8 }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFocusOnMap({ lat: Number(a.latitude), lon: Number(a.longitude), callsign: a.callsign, icao24: a.icao24 });
          }}
          title="Center map on this aircraft"
        >
          Find on map
        </button>
      )}
    </>
  ) : null;

  return (
    <div className="panel-content-grid">
      {closestAircraft && (
        <div className="aircraft-closest-block" style={{ marginBottom: 8, padding: 8, background: "rgba(245,159,0,0.12)", borderRadius: 8, border: "1px solid rgba(245,159,0,0.35)", fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 4 }}>Closest aircraft</div>
          <div style={{ color: "rgba(255,255,255,0.85)" }}>
            {fmt(closestAircraft.callsign, closestAircraft.icao24)} · {closestAircraft.distKm.toFixed(1)} km · {closestAircraft.bearing}° Azimuth
            {closestAircraft.baro_altitude != null && ` · ${Math.round(closestAircraft.baro_altitude)} m`}
          </div>
        </div>
      )}
      <div className="spots-filters" role="group" aria-label="Aircraft radius">
        <label className="spots-filter">
          <span className="spots-filter-label">Radius (km)</span>
          <select
            className="ui-select"
            value={radius}
            onChange={handleRadiusChange}
            aria-label="Aircraft radius in kilometers"
          >
            {radiusOptions(radius).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
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
            aria-label="Navigate aircraft"
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            <div className="news-slider-nav-row">
              <button
                type="button"
                className="news-slider-btn"
                onClick={() => go(-1)}
                aria-label="Previous aircraft"
              >
                &#60;
              </button>
              <span className="news-slider-counter" aria-live="polite">
                {index + 1} / {aircraft.length}
              </span>
              <button
                type="button"
                className="news-slider-btn"
                onClick={() => go(1)}
                aria-label="Next aircraft"
              >
                &#62;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
