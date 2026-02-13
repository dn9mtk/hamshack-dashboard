import { useEffect, useState, useCallback } from "react";
import PanelError from "./PanelError.jsx";
import PanelLoading from "./PanelLoading.jsx";

const SOTA_URL = "https://sotawatch.sota.org.uk";
const AUTO_ADVANCE_MS = 12000;

export const FILTER_ALL = "all";
export const FILTER_160M = "160m";
export const FILTER_80M = "80m";
export const FILTER_40M = "40m";
export const FILTER_20M = "20m";
export const FILTER_15M = "15m";
export const FILTER_10M = "10m";
export const FILTER_6M = "6m";
export const FILTER_2M = "2m";
export const FILTER_70CM = "70cm";

const FILTER_BUTTONS = [
  { key: FILTER_ALL, label: "All" },
  { key: FILTER_160M, label: "160m" },
  { key: FILTER_80M, label: "80m" },
  { key: FILTER_40M, label: "40m" },
  { key: FILTER_20M, label: "20m" },
  { key: FILTER_15M, label: "15m" },
  { key: FILTER_10M, label: "10m" },
  { key: FILTER_6M, label: "6m" },
  { key: FILTER_2M, label: "2m" },
  { key: FILTER_70CM, label: "70cm" }
];

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
  return item.frequency || "—";
}

export default function SOTAPanel({ filter = FILTER_ALL, onFilterChange }) {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const setFilter = onFilterChange || (() => {});

  const filteredItems =
    filter === FILTER_ALL
      ? items
      : items.filter((x) => x.band === filter);

  async function load() {
    try {
      setErr(null);
      const r = await fetch("/api/sota");
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
  }, []);

  useEffect(() => {
    setIndex((i) => (filteredItems.length ? Math.min(i, filteredItems.length - 1) : 0));
  }, [filter, filteredItems.length]);

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

  if (err) return <PanelError message={err} onRetry={load} label="SOTA" />;
  if (!loaded && items.length === 0) return <PanelLoading lines={4} />;
  if (items.length === 0) {
    return (
      <div className="news-panel-content news-panel-slider">
        <div className="news-slider-card" style={{ minHeight: 60 }}>
          <div className="panel-empty">No SOTA activators spotted. Try again later.</div>
        </div>
        <div className="contests-panel-footer">
          <a href={SOTA_URL} target="_blank" rel="noopener noreferrer" className="contests-panel-link">
            SOTAwatch
          </a>
        </div>
      </div>
    );
  }

  const item = filteredItems[index];
  const hasMultiple = filteredItems.length > 1;
  const emptyFilter = items.length > 0 && filteredItems.length === 0;

  const summitDisplay = item?.summitName
    ? `${item.reference || ""} ${item.summitName}`.trim()
    : item?.reference || "—";
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
      <span className="news-slider-date">{summitDisplay}</span>
      <span className="news-slider-date" style={{ marginTop: 2 }}>
        {formatFreq(item)} · {item.mode || "—"}
      </span>
      {formatSpotTime(item.spotTime) && (
        <span className="news-slider-date" style={{ marginTop: 2, fontSize: 11 }}>
          {formatSpotTime(item.spotTime)}
        </span>
      )}
      <a
        href={SOTA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="news-slider-hint"
        style={{ marginTop: 6 }}
        onClick={(e) => e.stopPropagation()}
      >
        SOTAwatch ↗
      </a>
    </>
  ) : null;

  return (
    <div className="news-panel-content news-panel-slider">
      <div className="pota-toggle contests-toggle" role="group" aria-label="Filter SOTA by band">
        {FILTER_BUTTONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`contests-toggle-btn pota-toggle-btn ${filter === key ? "active" : ""}`}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="news-slider-card">
        {emptyFilter ? (
          <div className="news-slider-link panel-empty-inline">No activators on this band</div>
        ) : (
          <a
            href={SOTA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="news-slider-link"
          >
            {cardContent}
          </a>
        )}
      </div>
      {hasMultiple && !emptyFilter && (
        <div
          className="news-slider-nav"
          role="group"
          aria-label="Navigate SOTA activator"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <div className="news-slider-nav-row">
            <button
              type="button"
              className="news-slider-btn"
              onClick={() => go(-1)}
              aria-label="Previous SOTA activator"
            >
              &#60;
            </button>
            <span className="news-slider-counter" aria-live="polite">
              {index + 1} / {filteredItems.length}
            </span>
            <button
              type="button"
              className="news-slider-btn"
              onClick={() => go(1)}
              aria-label="Next SOTA activator"
            >
              &#62;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
