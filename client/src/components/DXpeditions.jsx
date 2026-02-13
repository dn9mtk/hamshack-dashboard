import { useEffect, useState, useCallback } from "react";
import PanelError from "./PanelError.jsx";
import PanelLoading from "./PanelLoading.jsx";
import { formatDateRange } from "../lib/time.js";

const AUTO_ADVANCE_MS = 10000;

export const FILTER_ALL = "all";
export const FILTER_ACTIVE = "active";
export const FILTER_UPCOMING = "upcoming";

const FILTER_BUTTONS = [
  { key: FILTER_ALL, label: "All" },
  { key: FILTER_ACTIVE, label: "Active" },
  { key: FILTER_UPCOMING, label: "Upcoming" }
];

export default function DXpeditions({ filter = FILTER_ALL, onFilterChange }) {
  const [items, setItems] = useState([]);
  const [updated, setUpdated] = useState(null);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const setFilter = onFilterChange || (() => {});

  const filteredItems =
    filter === FILTER_ACTIVE
      ? items.filter((x) => x.status === "active")
      : filter === FILTER_UPCOMING
        ? items.filter((x) => x.status === "upcoming")
        : items;

  async function load() {
    try {
      setErr(null);
      const r = await fetch("/api/dxpeditions");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const list = data.items || [];
      setItems(list);
      setUpdated(data.updated);
      setLoaded(true);
      setIndex(0);
    } catch (e) {
      setErr(String(e));
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30 * 60 * 1000);
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

  if (err) return <PanelError message={err} onRetry={load} label="DXpeditions" />;
  if (!loaded && items.length === 0) return <PanelLoading lines={4} />;
  if (items.length === 0) {
    return (
      <div className="news-panel-content news-panel-slider">
        <div className="news-slider-card" style={{ minHeight: 60 }}>
          <div className="panel-empty">No DXpeditions found. Set DXPEDITION_URL to https://www.ng3k.com/Misc/adxoplain.html (or leave unset for NG3K ADXO).</div>
        </div>
      </div>
    );
  }

  const item = filteredItems[index];
  const hasMultiple = filteredItems.length > 1;
  const emptyFilter =
    items.length > 0 &&
    filteredItems.length === 0;

  const cardContent = (
    <>
      <span className="news-slider-title">
        {item.callsign}
        {item.status === "active" && (
          <span style={{ marginLeft: 6, fontSize: 11, color: "#51cf66", fontWeight: 700 }}>• NOW</span>
        )}
      </span>
      <span className="news-slider-date">{item.entity}</span>
      {(item.startDate || item.endDate) && (
        <span className="news-slider-date" style={{ marginTop: 2 }}>
          {formatDateRange(item.startDate, item.endDate)}
        </span>
      )}
      {item.url && <span className="news-slider-hint">More info ↗</span>}
    </>
  );

  return (
    <div className="news-panel-content news-panel-slider">
      <div className="dxpeditions-toggle" role="group" aria-label="Filter DXpeditions">
        {FILTER_BUTTONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`dxpeditions-toggle-btn ${filter === key ? "active" : ""}`}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="news-slider-card">
        {emptyFilter ? (
          <div className="news-slider-link panel-empty-inline">No entries in this category</div>
        ) : item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="news-slider-link"
          >
            {cardContent}
          </a>
        ) : (
          <div className="news-slider-link" style={{ cursor: "default", pointerEvents: "none" }}>
            {cardContent}
          </div>
        )}
      </div>
      {hasMultiple && !emptyFilter && (
        <div
          className="news-slider-nav"
          role="group"
          aria-label="Navigate DXpedition"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <div className="news-slider-nav-row">
            <button
              type="button"
              className="news-slider-btn"
              onClick={() => go(-1)}
              aria-label="Previous DXpedition"
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
                aria-label="Next DXpedition"
              >
                &#62;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
