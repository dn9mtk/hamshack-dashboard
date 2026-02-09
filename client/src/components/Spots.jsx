import { useEffect, useMemo, useState, useCallback } from "react";
import { formatDateTimeUtc, formatTimeLocal } from "../lib/time.js";
import { buildSpotQuery } from "../lib/spotsQuery.js";
import PanelError from "./PanelError.jsx";
import PanelLoading from "./PanelLoading.jsx";

const FILTER_KEY = "hamshack_spot_filters_v2";
const AUTO_ADVANCE_MS = 8000;

function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) return { band: "ALL", mode: "ALL" };
    const j = JSON.parse(raw);
    return { band: j.band || "ALL", mode: j.mode || "ALL" };
  } catch {
    return { band: "ALL", mode: "ALL" };
  }
}

function saveAndBroadcast(filters) {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify({ band: filters.band, mode: filters.mode })); } catch {}
  window.dispatchEvent(new CustomEvent("spotsFilterChanged", { detail: filters }));
}

export default function Spots() {
  const saved = loadSavedFilters();

  const [spots, setSpots] = useState([]);
  const [updated, setUpdated] = useState(null);
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);

  const [band, setBand] = useState(saved.band);
  const [mode, setMode] = useState(saved.mode);

  useEffect(() => saveAndBroadcast({ band, mode }), [band, mode]);

  const query = useMemo(() => buildSpotQuery({ band, mode }), [band, mode]);

  async function load() {
    try {
      setErr(null);
      const r = await fetch(query);
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      const j = await r.json();
      const list = j.spots || [];
      setSpots(list);
      setUpdated(j.updated);
      setStatus(j.status || null);
      setIndex((i) => (list.length ? Math.min(i, list.length - 1) : 0));
    } catch (e) {
      console.warn("Failed to load spots:", e);
      setErr(String(e));
      setSpots([]);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const go = useCallback((delta) => {
    setIndex((i) => {
      if (spots.length <= 1) return i;
      return (i + delta + spots.length) % spots.length;
    });
  }, [spots.length]);

  useEffect(() => {
    if (spots.length <= 1) return;
    const t = setInterval(() => go(1), AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [spots.length, go]);

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

  if (err) return <PanelError message={err} onRetry={load} label="Spots" />;
  if (!loaded && spots.length === 0) return <PanelLoading lines={5} />;

  const hasMultiple = spots.length > 1;
  const spot = spots[index];

  return (
    <div className="panel-content-grid">
      <div className="spots-filters">
        <Filter label="Band" value={band} setValue={setBand} options={["ALL","10","12","15","17","20","30","40"]} />
        <Filter label="Mode" value={mode} setValue={setMode} options={["ALL","CW","FT8","FT4","JT65","JT9","JS8","PSK","RTTY","SSB","AM","FM","SSTV"]} />
      </div>

      {spots.length === 0 ? (
        <div className="panel-empty">
          No spots yet. Try ALL/ALL and wait a moment.
        </div>
      ) : (
        <div className="news-panel-content news-panel-slider">
          <div className="news-slider-card">
            <div className="news-slider-link" style={{ cursor: "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <span className="news-slider-title" style={{ WebkitLineClamp: 1 }}>{spot.dx}</span>
                <span style={{ fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{spot.freq} MHz</span>
              </div>
              <div className="news-slider-date">
                {spot.mode || "—"} · {spot.src} · via {spot.spotter || "—"} · {formatTimeLocal(spot.t)}
                {typeof spot.bearing === "number" ? ` · ${spot.bearing}°` : ""}
                {typeof spot.distKm === "number" ? ` · ${spot.distKm} km` : ""}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4, fontSize: 12 }}>
                <a href={`https://www.qrz.com/db/${encodeURIComponent(spot.dx)}`} target="_blank" rel="noreferrer" style={{ color: "rgba(77,171,247,0.9)" }}>QRZ</a>
                <a href={`https://clublog.org/dxcc?call=${encodeURIComponent(spot.dx)}`} target="_blank" rel="noreferrer" style={{ color: "rgba(77,171,247,0.9)" }}>ClubLog</a>
              </div>
              {spot.entity && (
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>
                  {spot.entity}{spot.dxccPrefix ? ` (${spot.dxccPrefix})` : ""}
                </div>
              )}
              {spot.note && (
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>
                  {spot.note}
                </div>
              )}
            </div>
          </div>
          {hasMultiple && (
            <div
              className="news-slider-nav"
              role="group"
              aria-label="Navigate spot"
              tabIndex={0}
              onKeyDown={handleKeyDown}
            >
              <div className="news-slider-nav-row">
                <button
                  type="button"
                  className="news-slider-btn"
                  onClick={() => go(-1)}
                  aria-label="Previous spot"
                >
                  ‹
                </button>
                <span className="news-slider-counter" aria-live="polite">
                  {index + 1} / {spots.length}
                </span>
                <button
                  type="button"
                  className="news-slider-btn"
                  onClick={() => go(1)}
                  aria-label="Next spot"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="spots-meta spots-status">
        <span>Updated: {updated ? formatDateTimeUtc(updated) : "—"}</span>
        <span className="spots-meta-divider">·</span>
        <span>{spots.length} spots</span>
        {status && (
          <>
            <span className="spots-meta-divider">|</span>
            <span>DXC: {status.dxcluster?.connected ? "connected" : "disconnected"}{status.dxcluster?.error ? ` · ${status.dxcluster.error}` : ""}</span>
            <span className="spots-meta-divider">|</span>
            <span>RBN: {status.rbn?.connected ? "connected" : "disconnected"}{status.rbn?.error ? ` · ${status.rbn.error}` : ""}</span>
          </>
        )}
      </div>
    </div>
  );
}

function Filter({ label, value, setValue, options }) {
  return (
    <label className="spots-filter">
      <span className="spots-filter-label">{label}</span>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
