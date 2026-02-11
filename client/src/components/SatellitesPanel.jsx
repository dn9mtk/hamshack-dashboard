import { useEffect, useState, useCallback, useMemo } from "react";
import { formatDateTimeUtc, formatTimeLocal } from "../lib/time.js";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";

const AUTO_ADVANCE_MS = 8000;

function nextPassForSat(passesBySat, satId) {
  if (!passesBySat?.length || !satId) return null;
  const sat = passesBySat.find((s) => s.id === satId);
  const passes = sat?.passes;
  if (!passes?.length) return null;
  const now = Date.now();
  const next = passes.find((p) => new Date(p.aos).getTime() > now);
  if (!next) return null;
  const min = Math.round((new Date(next.aos).getTime() - now) / 60000);
  return { ...next, min };
}

export default function SatellitesPanel() {
  const [positions, setPositions] = useState([]);
  const [updated, setUpdated] = useState(null);
  const [err, setErr] = useState(null);
  const [index, setIndex] = useState(0);
  const [passesData, setPassesData] = useState(null);

  async function load() {
    try {
      setErr(null);
      const r = await fetch("/api/sat/positions");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error("API did not return JSON. Start backend?");
      }
      const j = await r.json();
      const list = j.positions || [];
      setPositions(list);
      setUpdated(j.updated || null);
      setIndex((i) => (list.length ? Math.min(i, list.length - 1) : 0));
    } catch (e) {
      const msg = e instanceof SyntaxError || (e?.message && e.message.includes("JSON"))
        ? "API unreachable. Start backend?"
        : String(e?.message || e);
      setErr(msg);
      setPositions([]);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  const satId = positions[index]?.id;
  useEffect(() => {
    if (!satId) {
      setPassesData(null);
      return;
    }
    let cancelled = false;
    async function fetchPasses() {
      try {
        const r = await fetch(`/api/sat/passes?ids=${encodeURIComponent(satId)}&hours=24`);
        if (!r.ok || cancelled) return;
        const j = await r.json();
        if (!cancelled) setPassesData(j);
      } catch {
        if (!cancelled) setPassesData(null);
      }
    }
    fetchPasses();
    const id = setInterval(fetchPasses, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [satId]);

  const nextPass = useMemo(
    () => nextPassForSat(passesData?.passes, satId),
    [passesData, satId]
  );

  const go = useCallback((delta) => {
    setIndex((i) => {
      if (positions.length <= 1) return i;
      return (i + delta + positions.length) % positions.length;
    });
  }, [positions.length]);

  useEffect(() => {
    if (positions.length <= 1) return;
    const t = setInterval(() => go(1), AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [positions.length, go]);

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

  if (err) return <PanelError message={err} onRetry={load} label="Satellites" />;
  if (positions.length === 0 && !err) return <PanelLoading lines={5} />;

  const hasMultiple = positions.length > 1;
  const sat = positions[index];
  if (!sat) return <div className="panel-empty">No satellites</div>;

  const latLon = `${Number(sat.lat).toFixed(2)}° ${Number(sat.lon).toFixed(2)}°`;
  const altStr = sat.altKm != null ? `${Number(sat.altKm).toFixed(0)} km` : "—";

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="news-panel-content news-panel-slider">
        <div className="news-slider-card">
          <div className="news-slider-link" style={{ cursor: "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <span className="news-slider-title" style={{ WebkitLineClamp: 1 }}>{sat.id || sat.name}</span>
              <span style={{ fontWeight: 700, fontSize: 12, flexShrink: 0, color: "rgba(255,255,255,0.85)" }}>{altStr}</span>
            </div>
            <div className="news-slider-date">
              {sat.name && sat.name !== (sat.id || "") ? sat.name : ""}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
              Position: {latLon}
            </div>
            {nextPass && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.2)", fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Next pass</div>
                <div style={{ color: "rgba(255,255,255,0.85)" }}>
                  AOS {formatTimeLocal(nextPass.aos)} · LOS {formatTimeLocal(nextPass.los)} · max {nextPass.maxEl}°
                </div>
                <div className="news-slider-hint" style={{ marginTop: 4 }}>
                  {nextPass.min <= 0 ? "Pass in progress" : `Next pass in ${nextPass.min} min`}
                </div>
              </div>
            )}
          </div>
        </div>
        {hasMultiple && (
          <div
            className="news-slider-nav"
            role="group"
            aria-label="Navigate satellite"
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            <div className="news-slider-nav-row">
              <button
                type="button"
                className="news-slider-btn"
                onClick={() => go(-1)}
                aria-label="Previous satellite"
              >
                ‹
              </button>
              <span className="news-slider-counter" aria-live="polite">
                {index + 1} / {positions.length}
              </span>
              <button
                type="button"
                className="news-slider-btn"
                onClick={() => go(1)}
                aria-label="Next satellite"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="spots-meta spots-status">
        <span>Updated: {updated ? formatDateTimeUtc(updated) : "—"}</span>
        <span className="spots-meta-divider">·</span>
        <span>{positions.length} satellites</span>
      </div>
    </div>
  );
}
