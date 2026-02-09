import { useEffect, useState, useCallback } from "react";
import PanelError from "./PanelError.jsx";
import PanelLoading from "./PanelLoading.jsx";

const REPEATERBOOK_URL = "https://www.repeaterbook.com/";
const AUTO_ADVANCE_MS = 12000;

export const REPEATER_BAND_2M = "2m";
export const REPEATER_BAND_70CM = "70cm";
export const REPEATER_BAND_10M = "10m";

const BAND_BUTTONS = [
  { key: REPEATER_BAND_2M, label: "2 m" },
  { key: REPEATER_BAND_70CM, label: "70 cm" },
  { key: REPEATER_BAND_10M, label: "10 m" }
];

function formatFreq(freq) {
  if (freq == null || !Number.isFinite(Number(freq))) return "—";
  const f = Number(freq);
  return f >= 1000 ? `${(f / 1000).toFixed(3)}` : f < 100 ? f.toFixed(2) : f.toFixed(2);
}

function formatOffset(offset) {
  if (offset == null || offset === "") return "";
  const n = Number(offset);
  if (!Number.isFinite(n)) return String(offset);
  if (n > 0) return `+${n.toFixed(2)}`;
  return `${n.toFixed(2)}`;
}

export default function RepeatersPanel({ band: bandProp, onBandChange }) {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const [bandLocal, setBandLocal] = useState(REPEATER_BAND_2M);
  const band = bandProp ?? bandLocal;
  const setBand = onBandChange ?? setBandLocal;

  async function load() {
    try {
      setErr(null);
      const r = await fetch("/api/repeaters");
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
    const id = setInterval(load, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const filteredItems = items.filter((r) => r.band === band);

  const go = useCallback((delta) => {
    setIndex((i) => {
      if (filteredItems.length <= 1) return i;
      return (i + delta + filteredItems.length) % filteredItems.length;
    });
  }, [filteredItems.length]);

  useEffect(() => {
    setIndex((i) => (filteredItems.length ? Math.min(i, filteredItems.length - 1) : 0));
  }, [band, filteredItems.length]);

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

  if (err) return <PanelError message={err} onRetry={load} label="Repeater" />;
  if (!loaded && items.length === 0) return <PanelLoading lines={4} />;
  if (items.length === 0) {
    return (
      <div className="news-panel-content news-panel-slider">
        <div className="news-slider-card" style={{ minHeight: 60 }}>
          <div className="panel-empty">Keine Repeater geladen. Backend starten? (RepeaterBook Deutschland)</div>
        </div>
        <div className="contests-panel-footer">
          <a href={REPEATERBOOK_URL} target="_blank" rel="noopener noreferrer" className="contests-panel-link">
            RepeaterBook
          </a>
        </div>
      </div>
    );
  }

  const emptyFilter = items.length > 0 && filteredItems.length === 0;
  const r = filteredItems[index];
  const hasMultiple = filteredItems.length > 1;

  const cardContent = r ? (
    <>
      <span className="news-slider-title">{r.callsign || "—"}</span>
      <div className="news-slider-date" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 2 }}>
        <span>{formatFreq(r.freq)} MHz</span>
        {r.offset != null && r.offset !== "" && (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatOffset(r.offset)} MHz</span>
        )}
      </div>
      {r.city && (
        <div className="news-slider-date" style={{ marginTop: 4, fontSize: 11 }}>
          {r.city}
        </div>
      )}
      <span className="news-slider-hint" style={{ marginTop: 6 }}>Repeater Deutschland · Karte: Repeater-Layer einschalten</span>
    </>
  ) : null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="contests-toggle" role="group" aria-label="Band wählen">
        {BAND_BUTTONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`contests-toggle-btn ${band === key ? "active" : ""}`}
            onClick={() => setBand(key)}
            aria-pressed={band === key}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="news-panel-content news-panel-slider">
        <div className="news-slider-card">
          {emptyFilter ? (
            <div className="news-slider-link panel-empty-inline">Keine Repeater in diesem Band</div>
          ) : (
            <div className="news-slider-link" style={{ cursor: "default" }}>
              {cardContent}
            </div>
          )}
        </div>
        {hasMultiple && !emptyFilter && (
          <div
            className="news-slider-nav"
            role="group"
            aria-label="Repeater durchblättern"
            tabIndex={0}
            onKeyDown={handleKeyDown}
          >
            <div className="news-slider-nav-row">
              <button type="button" className="news-slider-btn" onClick={() => go(-1)} aria-label="Vorheriger Repeater">‹</button>
              <span className="news-slider-counter" aria-live="polite">
                {index + 1} / {filteredItems.length}
              </span>
              <button type="button" className="news-slider-btn" onClick={() => go(1)} aria-label="Nächster Repeater">›</button>
            </div>
          </div>
        )}
      </div>
      <div className="contests-panel-footer">
        <a href={REPEATERBOOK_URL} target="_blank" rel="noopener noreferrer" className="contests-panel-link">
          RepeaterBook ↗
        </a>
      </div>
    </div>
  );
}
