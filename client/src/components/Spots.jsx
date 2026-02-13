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
    if (!raw) return { band: "ALL", mode: "ALL", src: "all", reachable: false };
    const j = JSON.parse(raw);
    return { band: j.band || "ALL", mode: j.mode || "ALL", src: j.src || "all", reachable: !!j.reachable };
  } catch {
    return { band: "ALL", mode: "ALL", src: "all", reachable: false };
  }
}

function saveAndBroadcast(filters) {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify({ band: filters.band, mode: filters.mode, src: filters.src, reachable: filters.reachable })); } catch {}
  window.dispatchEvent(new CustomEvent("spotsFilterChanged", { detail: filters }));
}

export default function Spots({ wantedPrefixes }) {
  const saved = loadSavedFilters();

  const [spots, setSpots] = useState([]);
  const [updated, setUpdated] = useState(null);
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);

  const [band, setBand] = useState(saved.band);
  const [mode, setMode] = useState(saved.mode);
  const [src, setSrc] = useState(saved.src || "all");
  const [spottedMe, setSpottedMe] = useState(false);
  const [reachable, setReachable] = useState(saved.reachable || false);

  useEffect(() => saveAndBroadcast({ band, mode, src, reachable }), [band, mode, src, reachable]);

  const query = useMemo(() => buildSpotQuery({ band, mode, src: src !== "all" ? src : undefined, spottedMe: spottedMe || undefined, reachable: reachable || undefined }), [band, mode, src, spottedMe, reachable]);

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

  const wantedList = useMemo(() => {
    const raw = (wantedPrefixes || "").trim();
    if (!raw) return [];
    return raw.split(/[\s,]+/).map((p) => p.trim().toUpperCase()).filter(Boolean);
  }, [wantedPrefixes]);

  const wantedMatches = useMemo(() => {
    if (wantedList.length === 0) return [];
    return spots.filter((s) => {
      const p = (s.dxccPrefix || "").toUpperCase();
      return wantedList.some((w) => p === w || p.startsWith(w) || w.startsWith(p));
    });
  }, [spots, wantedList]);

  if (err) return <PanelError message={err} onRetry={load} label="Spots" />;
  if (!loaded && spots.length === 0) return <PanelLoading lines={5} />;

  const hasMultiple = spots.length > 1;
  const spot = spots[index];

  return (
    <div className="panel-content-grid">
      {wantedMatches.length > 0 && (
        <div
          className="spots-wanted-alert"
          role="alert"
          style={{
            padding: "8px 12px",
            background: "rgba(77,171,247,0.2)",
            border: "1px solid rgba(77,171,247,0.5)",
            borderRadius: 6,
            fontSize: 13,
            color: "rgba(255,255,255,0.95)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "6px 12px"
          }}
        >
          <strong style={{ color: "rgba(77,171,247,0.95)" }}>Wanted DX spotted:</strong>
          {wantedMatches.slice(0, 5).map((s, i) => (
            <span key={i}>{s.dx} {s.freq} {s.mode || ""}</span>
          ))}
          {wantedMatches.length > 5 && <span>+{wantedMatches.length - 5} more</span>}
        </div>
      )}
      <div className="spots-filters">
        <Filter label="Band" value={band} setValue={setBand} options={["ALL","10","12","15","17","20","30","40"]} />
        <Filter label="Mode" value={mode} setValue={setMode} options={["ALL","CW","FT8","FT4","JT65","JT9","JS8","PSK","RTTY","SSB","AM","FM","SSTV"]} />
        <Filter label="Source" value={src} setValue={setSrc} options={[{ value: "all", label: "All" }, { value: "dxcluster", label: "DXC" }, { value: "rbn", label: "RBN" }]} />
        <div role="group" className="contests-toggle" aria-label="Spots view">
          <button
            type="button"
            className={`contests-toggle-btn ${!spottedMe ? "active" : ""}`}
            onClick={() => setSpottedMe(false)}
            aria-pressed={!spottedMe}
            title="All DX Cluster / RBN spots"
          >
            All spots
          </button>
          <button
            type="button"
            className={`contests-toggle-btn ${spottedMe ? "active" : ""}`}
            onClick={() => setSpottedMe(true)}
            aria-pressed={spottedMe}
            title="Who is spotting my callsign?"
          >
            Spotted me
          </button>
          <button
            type="button"
            className={`contests-toggle-btn ${reachable ? "active" : ""}`}
            onClick={() => setReachable((r) => !r)}
            aria-pressed={reachable}
            title="Only spots that could be reachable from QTH (MUF, distance 200–4500 km)"
          >
            Reachable
          </button>
        </div>
      </div>

      {spots.length === 0 ? (
        <div className="panel-empty">
          {spottedMe ? "No one is spotting your callsign yet." : reachable ? "No reachable spots. Try turning off Reachable or wait for propagation." : "No spots yet. Try ALL/ALL and wait a moment."}
        </div>
      ) : (
        <div className="news-panel-content news-panel-slider">
          <div className="news-slider-card">
            <div className="news-slider-link" style={{ cursor: "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <span className="news-slider-title" style={{ WebkitLineClamp: 1 }}>
                  {spottedMe ? (spot.spotter || spot.dx) : spot.dx}
                </span>
                <span style={{ fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{spot.freq} MHz</span>
              </div>
              <div className="news-slider-date">
                {spottedMe
                  ? `Spotted you · ${spot.mode || "—"} · ${spot.src} · ${formatTimeLocal(spot.t)}`
                  : `${spot.mode || "—"} · ${spot.src} · via ${spot.spotter || "—"} · ${formatTimeLocal(spot.t)}`}
                {typeof spot.distKm === "number" && ` · ${spot.distKm} km`}
              </div>
              {(typeof spot.bearing === "number" || typeof spot.distKm === "number") && (
                <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {typeof spot.bearing === "number" && (
                    <span title="Azimuth from QTH for antenna alignment">
                      <strong style={{ color: "rgba(77,171,247,0.95)" }}>{spot.bearing}°</strong> Azimuth
                    </span>
                  )}
                  {typeof spot.distKm === "number" && typeof spot.bearing === "number" && (
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>·</span>
                  )}
                  {typeof spot.distKm === "number" && (
                    <span>{spot.distKm} km</span>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4, fontSize: 12 }}>
                <a href={`https://www.qrz.com/db/${encodeURIComponent(spottedMe ? (spot.spotter || spot.dx) : spot.dx)}`} target="_blank" rel="noreferrer" style={{ color: "rgba(77,171,247,0.9)" }}>QRZ</a>
                <a href={`https://clublog.org/dxcc?call=${encodeURIComponent(spottedMe ? (spot.spotter || spot.dx) : spot.dx)}`} target="_blank" rel="noreferrer" style={{ color: "rgba(77,171,247,0.9)" }}>ClubLog</a>
              </div>
              {spot.entity && (
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>
                  {spot.entity}{spot.dxccPrefix ? ` (${spot.dxccPrefix})` : ""}
                </div>
              )}
              <GraylineInfo spot={spot} spottedMe={spottedMe} />
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
                  &#60;
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
                  &#62;
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

function fmtUtcHhMm(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function GraylineInfo({ spot, spottedMe }) {
  const [data, setData] = useState(null);
  const lat = Number(spottedMe ? spot?.spotterLat : spot?.lat);
  const lon = Number(spottedMe ? spot?.spotterLon : spot?.lon);
  const hasTarget = Number.isFinite(lat) && Number.isFinite(lon);

  useEffect(() => {
    if (!hasTarget) {
      setData(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/sun?toLat=${lat}&toLon=${lon}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.today && j?.dx?.today) setData({ qth: j.today, dx: j.dx.today });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hasTarget, lat, lon]);

  if (!hasTarget || !data) return null;

  const otherLabel = spottedMe ? "Spotter" : "DX";
  return (
    <div
      style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.12)" }}
      title="Sun at both ends for optimal grayline propagation. Best when one end is at dawn/dusk."
    >
      <strong style={{ color: "rgba(77,171,247,0.9)" }}>Grayline:</strong> QTH ↑ {fmtUtcHhMm(data.qth.sunriseUtc)} ↓ {fmtUtcHhMm(data.qth.sunsetUtc)} · {otherLabel} ↑ {fmtUtcHhMm(data.dx.sunriseUtc)} ↓ {fmtUtcHhMm(data.dx.sunsetUtc)} UTC
    </div>
  );
}

function Filter({ label, value, setValue, options }) {
  const opts = options.map((o) => (typeof o === "object" ? o : { value: o, label: o }));
  return (
    <label className="spots-filter">
      <span className="spots-filter-label">{label}</span>
      <select
        className="ui-select"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={label}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
