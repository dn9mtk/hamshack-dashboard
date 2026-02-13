import { useEffect, useState, useCallback } from "react";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";
import { formatDate } from "../lib/time.js";

const AUTO_ADVANCE_MS = 8000;

export default function NewsPanel() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);

  async function load() {
    try {
      setErr(null);
      const r = await fetch("/api/news");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const list = data.items || [];
      setItems(list);
      setLoaded(true);
      setIndex((i) => (list.length ? Math.min(i, list.length - 1) : 0));
    } catch (e) {
      setErr(String(e));
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

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

  if (err) return <PanelError message={err} onRetry={load} label="Local Ham News" />;
  if (!loaded && items.length === 0) return <PanelLoading lines={5} />;
  if (items.length === 0) return <div className="panel-empty">No entries</div>;

  const item = items[index];
  const hasMultiple = items.length > 1;

  return (
    <div className="news-panel-content news-panel-slider">
      <div className="news-slider-card">
        <a
          href={item.link || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="news-slider-link"
        >
          <span className="news-slider-title">{item.title}</span>
          {item.pubDate && (
            <span className="news-slider-date">{formatDate(item.pubDate)}</span>
          )}
          <span className="news-slider-hint">Read more ↗</span>
        </a>
      </div>
      {hasMultiple && (
        <div
          className="news-slider-nav"
          role="group"
          aria-label="Navigate news item"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <div className="news-slider-nav-row">
            <button
              type="button"
              className="news-slider-btn"
              onClick={() => go(-1)}
              aria-label="Previous item"
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
              aria-label="Next item"
            >
              &#62;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
