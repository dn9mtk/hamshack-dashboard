/**
 * Help overlay – glossary and shortcuts. Carousel: one entry per slide.
 */
import { useState, useCallback, useEffect } from "react";
import { GLOSSARY, SHORTCUTS } from "../lib/glossary.js";

const HELP_TABS = [
  { id: "prop", label: "Propagation" },
  { id: "range", label: "Range" },
  { id: "space", label: "Space" },
  { id: "keys", label: "Keys" },
];

const PROP_KEYS = ["MUF", "LUF", "FOT", "foF2", "SFI", "Kp", "A-index", "D-RAP", "grayline", "band status"];
const RANGE_KEYS = ["radio horizon", "terrain horizon", "EIRP", "FSPL", "QTH", "locator"];
const SPACE_KEYS = ["X-ray", "solar wind"];

function getItems(tab) {
  if (tab === "keys") {
    return SHORTCUTS.map(({ key: k, desc }) => ({ term: k, full: k, def: desc }));
  }
  const keys = tab === "prop" ? PROP_KEYS : tab === "range" ? RANGE_KEYS : SPACE_KEYS;
  return keys.map((k) => {
    const e = GLOSSARY[k];
    return e ? { term: e.term, full: e.full, def: e.def } : null;
  }).filter(Boolean);
}

export default function HelpOverlay({ open, onClose }) {
  const [tab, setTab] = useState("prop");
  const [index, setIndex] = useState(0);
  const items = getItems(tab);

  useEffect(() => {
    setIndex(0);
  }, [tab]);

  const go = useCallback((delta) => {
    setIndex((i) => (i + delta + items.length) % items.length);
  }, [items.length]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
  }, [go]);

  if (!open) return null;

  const item = items[index];
  const hasMultiple = items.length > 1;

  return (
    <div
      className="modal-overlay help-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="modal-dialog help-overlay-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 id="help-title">Quick Reference</h3>
        <p className="help-hint">? to toggle · Esc to close</p>
        <div className="bandplan-category-toggle help-overlay-tabs" role="group" aria-label="Help sections">
          {HELP_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`contests-toggle-btn ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="news-panel-content">
          <div className="news-slider-card help-overlay-card">
            <div
              className="news-slider-link news-slider-link--static help-overlay-content"
              tabIndex={0}
              onKeyDown={handleKeyDown}
            >
              {item && (
                <div className="help-entry">
                  <h4 className="help-entry-title">
                    {item.term}{item.full !== item.term && <span className="help-muted"> ({item.full})</span>}
                  </h4>
                  <p className="help-entry-def">{item.def}</p>
                </div>
              )}
            </div>
          </div>
          {hasMultiple && (
            <div className="news-slider-nav" role="group" aria-label="Navigate entry">
              <div className="news-slider-nav-row">
                <button type="button" className="news-slider-btn" onClick={() => go(-1)} aria-label="Previous entry">&#60;</button>
                <span className="news-slider-counter" aria-live="polite">{index + 1} / {items.length}</span>
                <button type="button" className="news-slider-btn" onClick={() => go(1)} aria-label="Next entry">&#62;</button>
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose} aria-label="Close">Close</button>
        </div>
      </div>
    </div>
  );
}
