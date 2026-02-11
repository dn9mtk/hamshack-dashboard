/**
 * Range panel: Radio horizon, link budget, terrain (HeyWhatsThat).
 * Antenna height drives the horizon circle on the map.
 * Carousel: one card per section, no auto-slide.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { gridCenter } from "../lib/grid.js";

const HORIZON_HEIGHT_KEY = "hamshack_horizon_height";
const CAROUSEL_ITEMS = [
  { id: "horizon", label: "Radio Horizon" },
  { id: "linkbudget", label: "Link Budget" },
  { id: "terrain", label: "Terrain" },
];

function loadHorizonHeight() {
  try {
    const v = parseFloat(localStorage.getItem(HORIZON_HEIGHT_KEY));
    return Number.isFinite(v) && v >= 0 ? v : 11;
  } catch {
    return 11;
  }
}

// Radio horizon: 4/3 Earth radius, d_km ≈ 4.12 * (√h1 + √h2)
function horizonKm(h1, h2) {
  if (!Number.isFinite(h1) || !Number.isFinite(h2) || h1 < 0 || h2 < 0) return null;
  return 4.12 * (Math.sqrt(h1) + Math.sqrt(h2));
}

// Link budget: EIRP (dBm), FSPL (dB), Pr (dBm)
function linkBudget(powerW, gainDbi, freqMHz, distKm) {
  if (!Number.isFinite(powerW) || !Number.isFinite(gainDbi) || !Number.isFinite(freqMHz) || !Number.isFinite(distKm) || powerW <= 0 || freqMHz <= 0 || distKm <= 0) return null;
  const eirp = 10 * Math.log10(powerW * 1000) + gainDbi;
  const fspl = 32.44 + 20 * Math.log10(freqMHz) + 20 * Math.log10(distKm);
  const pr = eirp - fspl;
  return { eirp, fspl, pr };
}

function rigFreqToMHz(rigFreq) {
  const raw = (rigFreq || "").trim().replace(",", ".");
  if (!raw) return null;
  const f = Number(raw);
  if (!Number.isFinite(f) || f <= 0) return null;
  return f >= 1000 ? f / 1000 : f;
}

export default function RangePanel({ locator, rigFreq, onHorizonChange }) {
  const [index, setIndex] = useState(0);
  const [linkBudgetInfoOpen, setLinkBudgetInfoOpen] = useState(false);
  const [horizonInfoOpen, setHorizonInfoOpen] = useState(false);
  const [h1, setH1] = useState(loadHorizonHeight);
  const [powerW, setPowerW] = useState(4);
  const [gainDbi, setGainDbi] = useState(5);
  const [distKm, setDistKm] = useState(20);

  const freqMHz = useMemo(() => rigFreqToMHz(rigFreq), [rigFreq]);

  const qth = useMemo(() => (locator && locator !== "—" ? gridCenter(locator) : null), [locator]);
  const heyWhatsThatUrl = useMemo(() => {
    if (!qth) return "https://www.heywhatsthat.com/";
    const params = new URLSearchParams({
      lat: qth.lat.toFixed(5),
      lon: qth.lon.toFixed(5),
    });
    return `https://www.heywhatsthat.com/?${params.toString()}`;
  }, [qth]);

  const horizonResults = useMemo(() => {
    const ground = horizonKm(h1, 0);
    return ground != null ? { ground, mobile: horizonKm(h1, 2), base: horizonKm(h1, 10) } : null;
  }, [h1]);
  const lb = useMemo(() => linkBudget(powerW, gainDbi, freqMHz, distKm), [powerW, gainDbi, freqMHz, distKm]);

  const go = useCallback((delta) => {
    setIndex((i) => (i + delta + CAROUSEL_ITEMS.length) % CAROUSEL_ITEMS.length);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  }, [go]);

  useEffect(() => {
    try {
      localStorage.setItem(HORIZON_HEIGHT_KEY, String(h1));
    } catch {}
  }, [h1]);

  useEffect(() => {
    if (!onHorizonChange) return;
    if (qth && horizonResults?.ground != null) {
      onHorizonChange({ center: qth, ground: horizonResults.ground, mobile: horizonResults.mobile, base: horizonResults.base });
    } else {
      onHorizonChange(null);
    }
  }, [qth, horizonResults, onHorizonChange]);

  const currentId = CAROUSEL_ITEMS[index]?.id;

  const currentLabel = CAROUSEL_ITEMS[index]?.label ?? "";

  return (
    <div className="news-panel-content news-panel-slider range-panel">
      <div className="news-slider-card range-panel-card">
        <div className="news-slider-link news-slider-link--static range-panel-inner">
          {currentId === "horizon" && (
            <div className={`range-flip-card ${horizonInfoOpen ? "range-flip-card--flipped" : ""}`}>
              <div className="range-flip-inner">
                <div className="range-flip-front range-slide">
                  <div className="range-slide-title-row">
                    <h3 className="range-slide-title">Radio Horizon</h3>
                    <button
                      type="button"
                      className="range-info-btn"
                      onClick={() => setHorizonInfoOpen(true)}
                      aria-label="Radio Horizon erklären"
                      title="Radio Horizon erklären"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 16v-4M12 8h.01"/>
                      </svg>
                    </button>
                  </div>
                  <p className="range-formula">d_km ≈ 4.12 × (√h₁ + √h₂)</p>
                  <div className="range-input-block">
                    <label htmlFor="range-h1">Antenna height (m)</label>
                    <input
                      id="range-h1"
                      type="number"
                      min="0"
                      step="0.5"
                      value={h1}
                      onChange={(e) => setH1(parseFloat(e.target.value) || 0)}
                      aria-label="Antenna height in meters"
                    />
                  </div>
                  <div className="range-results-block">
                    <div className="range-result-item">
                      <span className="range-result-dot" style={{ background: "rgba(230,119,0,0.8)" }} aria-hidden />
                      <span>vs. ground</span>
                      <strong>{horizonResults?.ground != null ? `${horizonResults.ground.toFixed(1)} km` : "—"}</strong>
                    </div>
                    <div className="range-result-item">
                      <span className="range-result-dot" style={{ background: "rgba(77,171,247,0.8)" }} aria-hidden />
                      <span>vs. mobile (~2 m)</span>
                      <strong>{horizonResults?.mobile != null ? `${horizonResults.mobile.toFixed(1)} km` : "—"}</strong>
                    </div>
                    <div className="range-result-item">
                      <span className="range-result-dot" style={{ background: "rgba(55,178,77,0.8)" }} aria-hidden />
                      <span>vs. base (~10 m)</span>
                      <strong>{horizonResults?.base != null ? `${horizonResults.base.toFixed(1)} km` : "—"}</strong>
                    </div>
                  </div>
                </div>
                <div className="range-flip-back range-slide">
                  <h3 className="range-slide-title">Radio Horizon erklärt</h3>
                  <div className="range-flip-back-content">
                    <p>Die Reichweite bis zum Horizont hängt von der Antennenhöhe ab. Die Formel nutzt den effektiven Erdradius (4/3 für troposphärische Brechung).</p>
                    <p><strong>Ground</strong> – Sichtlinie zur Bodenhöhe (0 m). Typisch für Bodenstationen oder SOTA-Gipfelkontakte.</p>
                    <p><strong>Mobile</strong> – Gegenstelle ca. 2 m hoch (Handfunkgerät, Auto). Relevante Reichweite für VHF/UHF-Mobilfunk.</p>
                    <p><strong>Base</strong> – Gegenstelle ca. 10 m hoch (Basisantenne, Repeater-Mast). Maximaltypische Reichweite bei beiden Stationen im Flachland.</p>
                    <p>Die Kreise erscheinen auf der Karte, wenn du „Range ON“ in der Map-Toolbar aktivierst.</p>
                  </div>
                  <button
                    type="button"
                    className="range-flip-ok-btn"
                    onClick={() => setHorizonInfoOpen(false)}
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}
          {currentId === "linkbudget" && (
            <div className={`range-flip-card ${linkBudgetInfoOpen ? "range-flip-card--flipped" : ""}`}>
              <div className="range-flip-inner">
                <div className="range-flip-front range-slide">
                  <div className="range-slide-title-row">
                    <h3 className="range-slide-title">Link Budget</h3>
                    <button
                      type="button"
                      className="range-info-btn"
                      onClick={() => setLinkBudgetInfoOpen(true)}
                      aria-label="Link Budget erklären"
                      title="Link Budget erklären"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 16v-4M12 8h.01"/>
                      </svg>
                    </button>
                  </div>
                  <p className="range-formula">Pr = EIRP − FSPL &nbsp;·&nbsp; FSPL = 32.44 + 20×log(f) + 20×log(d)</p>
                  <div className="range-input-grid">
                    <div className="range-input-block">
                      <label htmlFor="range-pwr">Power (W)</label>
                      <input id="range-pwr" type="number" min="0.1" step="0.5" value={powerW} onChange={(e) => setPowerW(parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="range-input-block">
                      <label htmlFor="range-gain">Gain (dBi)</label>
                      <input id="range-gain" type="number" min="0" step="0.5" value={gainDbi} onChange={(e) => setGainDbi(parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="range-input-block range-input-block--readonly">
                      <label>Freq (from rig)</label>
                      <span className="range-value">{freqMHz != null ? `${freqMHz.toFixed(3)} MHz` : "—"}</span>
                    </div>
                    <div className="range-input-block">
                      <label htmlFor="range-dist">Distance (km)</label>
                      <input id="range-dist" type="number" min="0.1" step="1" value={distKm} onChange={(e) => setDistKm(parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                  {lb && (
                    <div className="range-results-card">
                      <div className="range-results-row">
                        <span className="range-results-label">EIRP</span>
                        <span className="range-results-value">{lb.eirp.toFixed(0)} dBm</span>
                      </div>
                      <div className="range-results-row">
                        <span className="range-results-label">FSPL</span>
                        <span className="range-results-value">{lb.fspl.toFixed(0)} dB</span>
                      </div>
                      <div className="range-results-row range-results-row--highlight">
                        <span className="range-results-label">Pr (received)</span>
                        <span className="range-results-value">{lb.pr.toFixed(0)} dBm</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="range-flip-back range-slide">
                  <h3 className="range-slide-title">Link Budget erklärt</h3>
                  <div className="range-flip-back-content">
                    <p>Wie viel Sendeleistung kommt beim Empfänger an? Das Link Budget rechnet das aus.</p>
                    <p><strong>EIRP</strong> (Effective Isotropic Radiated Power) ist deine abgestrahlte Leistung: Senderleistung plus Antennengewinn.</p>
                    <p><strong>FSPL</strong> (Free Space Path Loss) ist die Dämpfung durch Ausbreitung im Freiraum – abhängig von Frequenz und Distanz.</p>
                    <p><strong>Pr</strong> = EIRP − FSPL ist die ankommende Leistung beim Gegenüber.</p>
                    <p>Typisch brauchst du mindestens ca. <strong>−120 dBm</strong> für FM, <strong>−130 dBm</strong> für Digitale Modi (FT8 etc.).</p>
                  </div>
                  <button
                    type="button"
                    className="range-flip-ok-btn"
                    onClick={() => setLinkBudgetInfoOpen(false)}
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}
          {currentId === "terrain" && (
            <div className="range-slide">
              <h3 className="range-slide-title">Terrain Horizon</h3>
              <p className="range-description">
                HeyWhatsThat computes terrain blockage per direction from SRTM data. Set antenna height, view the visibility cloak.
              </p>
              {qth ? (
                <a href={heyWhatsThatUrl} target="_blank" rel="noopener noreferrer" className="range-terrain-link">
                  Open HeyWhatsThat with your QTH
                  <span className="range-terrain-coords">{qth.lat.toFixed(4)}°, {qth.lon.toFixed(4)}°</span>
                </a>
              ) : (
                <p className="range-empty">Set locator in Settings for terrain link.</p>
              )}
            </div>
          )}
        </div>
      </div>
      <div
        className="news-slider-nav range-panel-nav"
        role="group"
        aria-label="Navigate range section"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="news-slider-nav-row">
          <button type="button" className="news-slider-btn" onClick={() => go(-1)} aria-label="Previous section">
            ‹
          </button>
          <span className="news-slider-counter" aria-live="polite">
            <span className="range-nav-label">{currentLabel}</span>
            <span className="range-nav-index">{index + 1} / {CAROUSEL_ITEMS.length}</span>
          </span>
          <button type="button" className="news-slider-btn" onClick={() => go(1)} aria-label="Next section">
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
