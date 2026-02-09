import { useEffect, useState, useCallback } from "react";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";
import { formatDateTimeUtc } from "../lib/time.js";

const WA7BNM_URL = "https://www.contestcalendar.com/";
const AUTO_ADVANCE_MS = 10000;
const HOUR_MS = 60 * 60 * 1000;

export const CONTEST_FILTER_ALL = "all";
export const CONTEST_FILTER_NEXT = "next";     // startet in < 24 h
export const CONTEST_FILTER_UPCOMING = "upcoming"; // startet in ≥ 24 h

const CONTEST_FILTER_BUTTONS = [
  { key: CONTEST_FILTER_ALL, label: "All" },
  { key: CONTEST_FILTER_NEXT, label: "Starts next" },
  { key: CONTEST_FILTER_UPCOMING, label: "Upcoming" }
];

/** Einheitliches startTime-Feld (API kann startTime, start_time, startDate liefern). */
function getStartTime(c) {
  if (!c) return null;
  const t = c.startTime ?? c.start_time ?? c.startDate ?? null;
  if (!t) return null;
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? t : null;
}

function hoursUntilStart(startTime) {
  if (!startTime) return null;
  const start = new Date(startTime).getTime();
  const now = Date.now();
  return (start - now) / HOUR_MS;
}

function formatStartsIn(startTime) {
  if (!startTime) return null;
  const start = new Date(startTime);
  const now = Date.now();
  const ms = start.getTime() - now;
  if (ms < 0) return "Started";
  const hours = Math.floor(ms / HOUR_MS);
  const days = Math.floor(hours / 24);
  if (days > 0) return `Starts in ${days}d`;
  if (hours > 0) return `Starts in ${hours}h`;
  const mins = Math.floor(ms / (60 * 1000));
  return mins > 0 ? `Starts in ${mins}m` : "Starting now";
}

/** "Starts in X h" for map display (under 24 h). */
function formatStartsInHours(startTime) {
  if (!startTime) return null;
  const h = hoursUntilStart(startTime);
  if (h == null || h < 0) return null;
  if (h < 1) {
    const m = Math.floor(h * 60);
    return m <= 0 ? "Starting now" : `Starts in ${m} min`;
  }
  if (h < 24) return `Starts in ${Math.floor(h)} h`;
  const d = Math.floor(h / 24);
  return `Starts in ${d} days`;
}

export default function ContestsPanel() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const [filter, setFilter] = useState(CONTEST_FILTER_ALL);

  async function load() {
    try {
      setErr(null);
      const r = await fetch("/api/contests");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error("API did not return JSON. Start backend?");
      }
      const data = await r.json();
      const list = data.items || [];
      setItems(list);
      setLoaded(true);
      setIndex((i) => (list.length ? Math.min(i, list.length - 1) : 0));
    } catch (e) {
      setErr(e?.message || String(e));
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const filteredItems = items.filter((c) => {
    const startTime = getStartTime(c);
    const h = hoursUntilStart(startTime);
    if (h == null) return filter === CONTEST_FILTER_ALL;
    if (h < 0) return false;
    if (filter === CONTEST_FILTER_NEXT) return h < 24;
    if (filter === CONTEST_FILTER_UPCOMING) return h >= 24;
    return true;
  });

  const go = useCallback((delta) => {
    setIndex((i) => {
      if (filteredItems.length <= 1) return i;
      return (i + delta + filteredItems.length) % filteredItems.length;
    });
  }, [filteredItems.length]);

  useEffect(() => {
    if (filteredItems.length <= 1) return;
    const t = setInterval(() => go(1), AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [filteredItems.length, go]);

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

  useEffect(() => {
    setIndex((i) => (filteredItems.length ? Math.min(i, filteredItems.length - 1) : 0));
  }, [filter, filteredItems.length]);

  if (err) return <PanelError message={err} onRetry={load} label="Contests" />;
  if (!loaded && items.length === 0) return <PanelLoading lines={5} />;
  if (items.length === 0) {
    return (
      <div className="news-panel-content news-panel-slider">
        <div className="news-slider-card" style={{ minHeight: 60 }}>
          <div className="panel-empty">No contests loaded.</div>
        </div>
        <div className="contests-panel-footer">
          <a href={WA7BNM_URL} target="_blank" rel="noopener noreferrer" className="contests-panel-link">
            WA7BNM Contest Calendar
          </a>
        </div>
      </div>
    );
  }

  const emptyFilter = items.length > 0 && filteredItems.length === 0;
  const c = filteredItems[index];
  const hasMultiple = filteredItems.length > 1;
  const startTime = c ? getStartTime(c) : null;
  const timeStr = startTime ? formatStartsIn(startTime) : null;
  const timeStrHours = startTime ? formatStartsInHours(startTime) : null;
  const startDateTimeStr = startTime ? formatDateTimeUtc(startTime) : "—";

  const cardContent = c ? (
    <>
      <span className="news-slider-title">{c.name}</span>
      <div className="news-slider-date" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 2 }}>
        <span>{c.type || "Mixed"}</span>
        {timeStr && <span className="contests-panel-time">{timeStr}</span>}
      </div>
      <div className="news-slider-date" style={{ marginTop: 4, fontSize: 11 }}>
        Start: {startDateTimeStr}
        {timeStrHours && (
          <span style={{ marginLeft: 6, color: "rgba(255,255,255,0.65)" }}>({timeStrHours})</span>
        )}
      </div>
      <a
        href={WA7BNM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="news-slider-hint"
        style={{ marginTop: 6 }}
        onClick={(e) => e.stopPropagation()}
      >
        WA7BNM Contest Calendar ↗
      </a>
    </>
  ) : null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="contests-toggle" role="group" aria-label="Filter contests">
        {CONTEST_FILTER_BUTTONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`contests-toggle-btn ${filter === key ? "active" : ""}`}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="news-panel-content news-panel-slider">
        <div className="news-slider-card">
          {emptyFilter ? (
            <div className="news-slider-link panel-empty-inline">No contests in this category</div>
          ) : c ? (
            c.url ? (
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="news-slider-link">
                {cardContent}
              </a>
            ) : (
              <div className="news-slider-link" style={{ cursor: "default" }}>
                {cardContent}
              </div>
            )
          ) : null}
        </div>
        {hasMultiple && !emptyFilter && (
          <div
            className="news-slider-nav"
            role="group"
            aria-label="Navigate contest"
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            <div className="news-slider-nav-row">
              <button
                type="button"
                className="news-slider-btn"
                onClick={() => go(-1)}
                aria-label="Previous contest"
              >
                ‹
              </button>
              <span className="news-slider-counter" aria-live="polite">
                {index + 1} / {filteredItems.length}
              </span>
              <button
                type="button"
                className="news-slider-btn"
                onClick={() => go(1)}
                aria-label="Next contest"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
