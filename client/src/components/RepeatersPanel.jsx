import { useEffect, useState, useCallback } from "react";
import PanelError from "./PanelError.jsx";
import PanelLoading from "./PanelLoading.jsx";

const REPEATERBOOK_URL = "https://www.repeaterbook.com/";

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

export default function RepeatersPanel({ band: bandProp, onBandChange, selectedRepeater, onFocusRepeater }) {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const [bandLocal, setBandLocal] = useState(REPEATER_BAND_2M);
  const [query, setQuery] = useState("");
  const [reachability, setReachability] = useState(null);
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

  const search = query.trim().toLowerCase();

  // When there is no search query, restrict to current band.
  // When a search query is present, search across *all* bands.
  const bandItems = search ? items : items.filter((r) => r.band === band);
  const filteredItems = bandItems.filter((r) => {
    if (!search) return true;
    const parts = [];
    const FIELDS = ["callsign", "city", "band", "mode", "notes", "remark", "qth", "locator"];
    for (const key of FIELDS) {
      const v = r[key];
      if (v != null && v !== "") parts.push(String(v));
    }
    if (r.freq != null) parts.push(String(r.freq));
    if (r.offset != null && r.offset !== "") parts.push(String(r.offset));
    const text = parts.join(" ").toLowerCase();
    return text.includes(search);
  });

  // When a repeater is selected on the map, sync band and slider index in this panel.
  // Important: this hook must be *before* any conditional return to keep the hooks
  // order stable across all renders.
  useEffect(() => {
    if (!selectedRepeater || !items.length) return;

    const targetBand = selectedRepeater.band || band;
    if (!targetBand) return;

    // Switch to the band of the selected repeater (if available).
    if (selectedRepeater.band && selectedRepeater.band !== band) {
      setBand(selectedRepeater.band);
    }

    // Clear search so the selected repeater is not hidden by a previous query.
    if (query !== "") {
      setQuery("");
    }

    // Try to move the slider to the matching repeater within the current band.
    setIndex((current) => {
      const bandList = items.filter((x) => x.band === targetBand);
      if (!bandList.length) return current;

      const idx = bandList.findIndex((x) => {
        const sameBand = x.band === targetBand;
        const sameCall =
          (x.callsign || "").toUpperCase() === (selectedRepeater.callsign || "").toUpperCase();
        return sameBand && sameCall;
      });

      return idx >= 0 ? idx : current;
    });
  }, [selectedRepeater, items]);

  const go = useCallback((delta) => {
    setIndex((i) => {
      if (filteredItems.length <= 1) return i;
      return (i + delta + filteredItems.length) % filteredItems.length;
    });
  }, [filteredItems.length]);

  useEffect(() => {
    setIndex((i) => (filteredItems.length ? Math.min(i, filteredItems.length - 1) : 0));
  }, [band, filteredItems.length]);

  const currentRepeater = filteredItems[index];
  useEffect(() => {
    const lat = currentRepeater?.lat != null ? Number(currentRepeater.lat) : NaN;
    const lon = currentRepeater?.lon != null ? Number(currentRepeater.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setReachability(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/propagation/path?toLat=${lat}&toLon=${lon}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((data) => {
        if (!cancelled)
          setReachability({
            lineOfSightClear: data.lineOfSightClear,
            obstructedAtKm: data.obstructedAtKm,
            distanceKm: data.distanceKm
          });
      })
      .catch(() => {
        if (!cancelled) setReachability(null);
      });
    return () => { cancelled = true; };
  }, [currentRepeater?.lat, currentRepeater?.lon]);

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

  // When search is active, use the repeater's own band for coloring the card.
  const cardBandClass = r?.band || band;

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
      {reachability != null && (
        <div className="news-slider-date" style={{ marginTop: 6, fontSize: 12 }}>
          LOS: {reachability.lineOfSightClear ? (
            <strong style={{ color: "rgba(81,207,102,0.95)" }}>Clear</strong>
          ) : (
            <span>Obstructed{reachability.obstructedAtKm != null ? ` ~${reachability.obstructedAtKm} km` : ""}</span>
          )}
          {reachability.distanceKm != null && ` · ${reachability.distanceKm} km`}
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
      <div className="spots-filters repeaters-filters">
        <label className="spots-filter repeaters-filter-search">
          <span className="spots-filter-label">Search</span>
          <input
            type="text"
            className="repeaters-search-input"
            placeholder="Callsign, city, freq..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            aria-label="Search repeaters"
          />
        </label>
      </div>
      <div className="news-panel-content news-panel-slider">
        <div className={`news-slider-card repeaters-card repeaters-card--${cardBandClass}`}>
          {emptyFilter ? (
            <div className="news-slider-link panel-empty-inline">Keine Repeater in diesem Band</div>
          ) : (
            <div className="news-slider-link" style={{ cursor: "default" }}>
              {cardContent}
              {onFocusRepeater && r && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)) && (
                <button
                  type="button"
                  className="news-slider-btn repeaters-focus-btn"
                  onClick={() => onFocusRepeater(r)}
                  style={{ marginTop: 8, alignSelf: "flex-start" }}
                >
                  Auf Karte zentrieren
                </button>
              )}
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
              <button type="button" className="news-slider-btn" onClick={() => go(-1)} aria-label="Vorheriger Repeater">&#60;</button>
              <span className="news-slider-counter" aria-live="polite">
                {index + 1} / {filteredItems.length}
              </span>
              <button type="button" className="news-slider-btn" onClick={() => go(1)} aria-label="Nächster Repeater">&#62;</button>
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
