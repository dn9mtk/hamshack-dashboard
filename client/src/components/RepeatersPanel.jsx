import { useEffect, useState, useCallback } from "react";
import PanelError from "./PanelError.jsx";
import PanelLoading from "./PanelLoading.jsx";

const REPEATERBOOK_URL = "https://www.repeaterbook.com/";
const COVERAGE_POWER_KEY = "hamshack_repeater_power";
const COVERAGE_GAIN_KEY = "hamshack_repeater_gain";
const COVERAGE_MAST_KEY = "hamshack_repeater_mast";

function loadCoveragePower() {
  try {
    const v = parseFloat(localStorage.getItem(COVERAGE_POWER_KEY));
    return Number.isFinite(v) && v > 0 ? v : 5;
  } catch { return 5; }
}
function loadCoverageGain() {
  try {
    const v = parseFloat(localStorage.getItem(COVERAGE_GAIN_KEY));
    return Number.isFinite(v) && v >= 0 ? v : 5;
  } catch { return 5; }
}
function loadCoverageMast() {
  try {
    const v = parseFloat(localStorage.getItem(COVERAGE_MAST_KEY));
    return Number.isFinite(v) && v >= 0 ? v : 20;
  } catch { return 20; }
}

function horizonKm(h1, h2) {
  if (!Number.isFinite(h1) || !Number.isFinite(h2) || h1 < 0 || h2 < 0) return null;
  return 4.12 * (Math.sqrt(h1) + Math.sqrt(h2));
}

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
  const [pathData, setPathData] = useState(null);
  const [powerW, setPowerW] = useState(loadCoveragePower);
  const [gainDbi, setGainDbi] = useState(loadCoverageGain);
  const [mastM, setMastM] = useState(loadCoverageMast);
  const [h1, setH1] = useState(() => {
    try {
      const v = parseFloat(localStorage.getItem("hamshack_horizon_height"));
      return Number.isFinite(v) && v >= 0 ? v : 11;
    } catch { return 11; }
  });
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
  const repFreq = currentRepeater?.freq != null ? Number(currentRepeater.freq) : null;
  const repOffset = currentRepeater?.offset != null ? Number(currentRepeater.offset) : 0;
  const inputFreq = repFreq != null && Number.isFinite(repFreq) ? repFreq - repOffset : null;

  useEffect(() => {
    const lat = currentRepeater?.lat != null ? Number(currentRepeater.lat) : NaN;
    const lon = currentRepeater?.lon != null ? Number(currentRepeater.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setReachability(null);
      setPathData(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ toLat: lat, toLon: lon, powerW });
    if (Number.isFinite(inputFreq) && inputFreq > 0) params.set("freq", inputFreq);
    fetch(`/api/propagation/path?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((data) => {
        if (!cancelled) {
          setReachability({
            lineOfSightClear: data.lineOfSightClear,
            obstructedAtKm: data.obstructedAtKm,
            distanceKm: data.distanceKm,
            bearing: data.bearing
          });
          setPathData(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReachability(null);
          setPathData(null);
        }
      });
    return () => { cancelled = true; };
  }, [currentRepeater?.lat, currentRepeater?.lon, inputFreq, powerW]);

  useEffect(() => {
    try {
      localStorage.setItem(COVERAGE_POWER_KEY, String(powerW));
      localStorage.setItem(COVERAGE_GAIN_KEY, String(gainDbi));
      localStorage.setItem(COVERAGE_MAST_KEY, String(mastM));
    } catch {}
  }, [powerW, gainDbi, mastM]);

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
          {typeof reachability.bearing === "number" && ` · ${reachability.bearing}°`}
        </div>
      )}
      {pathData && r && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)) && (
        <div className="repeaters-coverage-block" style={{ marginTop: 10, padding: 10, background: "rgba(77,171,247,0.08)", borderRadius: 8 }}>
          <h4 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px 0", color: "rgba(255,255,255,0.9)" }}>Coverage (QTH → Repeater)</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
            <div>
              <label htmlFor="rep-cov-pwr" style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>Power (W)</label>
              <input id="rep-cov-pwr" type="number" min="0.1" step="0.5" value={powerW} onChange={(e) => setPowerW(parseFloat(e.target.value) || 0)} style={{ width: "100%", padding: 4, borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fff", fontSize: 12 }} />
            </div>
            <div>
              <label htmlFor="rep-cov-gain" style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>Gain (dBi)</label>
              <input id="rep-cov-gain" type="number" min="0" step="0.5" value={gainDbi} onChange={(e) => setGainDbi(parseFloat(e.target.value) || 0)} style={{ width: "100%", padding: 4, borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fff", fontSize: 12 }} />
            </div>
            <div>
              <label htmlFor="rep-cov-mast" style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>Mast (m)</label>
              <input id="rep-cov-mast" type="number" min="0" step="1" value={mastM} onChange={(e) => setMastM(parseFloat(e.target.value) || 0)} style={{ width: "100%", padding: 4, borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.2)", color: "#fff", fontSize: 12 }} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            {pathData.linkBudget && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="repeaters-coverage-dot" style={{ background: (() => {
                    const pl = pathData.linkBudget.pathLossDb;
                    if (pl == null) return "rgba(255,255,255,0.3)";
                    const eirp = 10 * Math.log10(powerW * 1000) + gainDbi;
                    const pr = eirp - pl;
                    const sens = -120;
                    if (pathData.linkBudget?.linkEstimate === "out_of_range") return "#ff6b6b";
                    if (pr >= sens + 10) return "#51cf66";
                    if (pr >= sens + 3) return "#ffd43b";
                    return "#ff922b";
                  })() }} />
                  Signal at repeater
                </span>
                <strong style={{ color: (() => {
                  const pl = pathData.linkBudget.pathLossDb;
                  if (pl == null) return "inherit";
                  const eirp = 10 * Math.log10(powerW * 1000) + gainDbi;
                  const pr = eirp - pl;
                  const sens = -120;
                  if (pathData.linkBudget?.linkEstimate === "out_of_range") return "#ff6b6b";
                  if (pr >= sens + 10) return "#51cf66";
                  if (pr >= sens + 3) return "#ffd43b";
                  return "#ff922b";
                })() }}>
                  {(() => {
                    const pl = pathData.linkBudget.pathLossDb;
                    if (pl == null) return "—";
                    const eirp = 10 * Math.log10(powerW * 1000) + gainDbi;
                    const pr = eirp - pl;
                    const sens = -120;
                    let lab = "Weak";
                    if (pathData.linkBudget?.linkEstimate === "out_of_range") lab = "Out of range";
                    else if (pr >= sens + 10) lab = "OK";
                    else if (pr >= sens + 3) lab = "Marginal";
                    return `${pr.toFixed(0)} dBm (${lab})`;
                  })()}
                </strong>
              </div>
            )}
            {pathData.linkBudget?.pathLossDb != null && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="repeaters-coverage-dot" style={{ background: (() => {
                    const pl = pathData.linkBudget.pathLossDb;
                    if (pl < 100) return "#51cf66";
                    if (pl < 115) return "#ffd43b";
                    return "#ff922b";
                  })() }} />
                  Path loss
                </span>
                <strong style={{ color: (() => {
                  const pl = pathData.linkBudget.pathLossDb;
                  if (pl < 100) return "#51cf66";
                  if (pl < 115) return "#ffd43b";
                  return "#ff922b";
                })() }}>{pathData.linkBudget.pathLossDb} dB</strong>
              </div>
            )}
            {horizonKm(h1, mastM) != null && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="repeaters-coverage-dot" style={{ background: pathData.distanceKm > horizonKm(h1, mastM) ? "#ff922b" : "#51cf66" }} />
                  Radio horizon
                </span>
                <strong style={{ color: pathData.distanceKm > horizonKm(h1, mastM) ? "#ff922b" : "#51cf66" }}>
                  {horizonKm(h1, mastM).toFixed(1)} km{pathData.distanceKm > horizonKm(h1, mastM) ? " (path beyond)" : ""}
                </strong>
              </div>
            )}
          </div>
          <p className="repeaters-coverage-legend" style={{ margin: "8px 0 0 0", fontSize: 10, color: "rgba(255,255,255,0.5)", display: "flex", flexWrap: "wrap", gap: "6px 12px", alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span className="repeaters-coverage-dot" style={{ background: "#51cf66" }} />good</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span className="repeaters-coverage-dot" style={{ background: "#ffd43b" }} />marginal</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span className="repeaters-coverage-dot" style={{ background: "#ff922b" }} />weak</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span className="repeaters-coverage-dot" style={{ background: "#ff6b6b" }} />poor</span>
          </p>
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
