import { useEffect, useState, useMemo, useCallback } from "react";
import { formatDateTimeUtc } from "../lib/time.js";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";
import InfoTooltip from "./InfoTooltip.jsx";

const CAROUSEL_SLIDES = ["muf", "forecast"];

const STATUS_COLOR = { open: "#37b24d", marginal: "#f59f00", closed: "#868e96", disturbed: "#f03e3e" };

const FORECAST_TARGETS = [
  { id: "JA", label: "Japan" },
  { id: "VK", label: "Australia" },
  { id: "NA", label: "North America" },
  { id: "SA", label: "South America" },
  { id: "AF", label: "South Africa" },
  { id: "OC", label: "Oceania" }
];

function fmtHhMm(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// HamClock-style: frequency scale 0–35 MHz, band markers at 7, 14, 21, 28
const MUF_SCALE_MAX_MHZ = 35;
const BAND_MARKERS = [
  { freq: 7, label: "40m" },
  { freq: 14, label: "20m" },
  { freq: 21, label: "15m" },
  { freq: 28, label: "10m" }
];

export default function Propagation() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [forecastTarget, setForecastTarget] = useState("JA");
  const [forecast, setForecast] = useState(null);
  const [forecastErr, setForecastErr] = useState(null);

  const go = useCallback((delta) => {
    setSlideIndex((i) => (i + delta + CAROUSEL_SLIDES.length) % CAROUSEL_SLIDES.length);
  }, []);

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

  async function load() {
    try {
      setErr(null);
      const r = await fetch("/api/propagation");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
    } catch (e) {
      setErr(String(e));
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setForecastErr(null);
    fetch(`/api/propagation/forecast?target=${encodeURIComponent(forecastTarget)}&hours=24`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((j) => { if (!cancelled) setForecast(j); })
      .catch((e) => { if (!cancelled) setForecastErr(String(e)); });
    return () => { cancelled = true; };
  }, [forecastTarget]);

  if (err) return <PanelError message={err} onRetry={load} label="Propagation" />;
  if (!data) return <PanelLoading lines={5} />;

  const mufMHz = data.mufMHz != null ? Math.min(Number(data.mufMHz), MUF_SCALE_MAX_MHZ) : 0;
  const fillPercent = (mufMHz / MUF_SCALE_MAX_MHZ) * 100;
  const isMufSlide = slideIndex === 0;

  return (
    <div className="panel-content-grid">
      <div className="news-panel-content news-panel-slider">
        <div className="news-slider-card">
          <div className="news-slider-link news-slider-link--static" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {isMufSlide ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <InfoTooltip term="MUF">
                    <span className="news-slider-title" style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>MUF (est.)</span>
                  </InfoTooltip>
                  <span style={{ fontWeight: 800, fontSize: 18 }}>{data.mufMHz != null ? `${data.mufMHz} MHz` : "—"}</span>
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <div
                    style={{
                      position: "relative",
                      height: 24,
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      overflow: "hidden"
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${fillPercent}%`,
                        borderRadius: "6px 0 0 6px",
                        background: "linear-gradient(90deg, #339af0 0%, #4dabf7 100%)"
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                    <span>0</span>
                    <span>{MUF_SCALE_MAX_MHZ} MHz</span>
                  </div>
                  <div style={{ position: "relative", height: 14, marginTop: -2 }}>
                    {BAND_MARKERS.map(({ freq, label }) => {
                      const leftPercent = (freq / MUF_SCALE_MAX_MHZ) * 100;
                      return (
                        <div
                          key={freq}
                          style={{
                            position: "absolute",
                            left: `${leftPercent}%`,
                            transform: "translateX(-50%)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 2
                          }}
                        >
                          <div style={{ width: 1, height: 6, background: "rgba(255,255,255,0.4)" }} />
                          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="news-slider-date" style={{ fontSize: 12 }}>
                  <InfoTooltip term="SFI"><span>SFI</span></InfoTooltip> {data.sfi ?? "—"} · <InfoTooltip term="Kp"><span>Kp</span></InfoTooltip> {data.kp ?? "—"}
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {(data.bands || []).map((b) => (
                    <div
                      key={b.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.04)"
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[b.status] || "#868e96" }} />
                      <span style={{ fontWeight: 700, minWidth: 32 }}>{b.name}</span>
                      <span style={{ color: "rgba(255,255,255,0.75)", textTransform: "capitalize" }}>{b.status}</span>
                    </div>
                  ))}
                </div>
                <div className="news-slider-date">
                  Updated: {formatDateTimeUtc(data.updated)}
                </div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                  Full prediction from <InfoTooltip term="MUF"><span>MUF</span></InfoTooltip> at your <InfoTooltip term="QTH"><span>QTH</span></InfoTooltip> (SFI + solar zenith).
                </div>
              </>
            ) : (
              <>
                <span className="news-slider-title">Band opening forecast</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <label htmlFor="prop-forecast-target" className="news-slider-date" style={{ fontSize: 12 }}>Target</label>
                  <select
                    id="prop-forecast-target"
                    className="ui-select"
                    value={forecastTarget}
                    onChange={(e) => setForecastTarget(e.target.value)}
                    aria-label="Target region"
                  >
                    {FORECAST_TARGETS.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
                {forecastErr && (
                  <div className="news-slider-date" style={{ fontSize: 12 }}>Forecast unavailable.</div>
                )}
                {forecast && !forecastErr && (() => {
                  const t = FORECAST_TARGETS.find((x) => x.id === forecastTarget);
                  return (
                    <BandOpeningSummary
                      forecast={forecast}
                      fmtHhMm={fmtHhMm}
                      targetLabel={t ? `${forecastTarget} (${t.label})` : forecast.target}
                    />
                  );
                })()}
              </>
            )}
          </div>
        </div>
        <div
          className="news-slider-nav"
          role="group"
          aria-label="MUF / Band forecast"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <div className="news-slider-nav-row">
            <button
              type="button"
              className="news-slider-btn"
              onClick={() => go(-1)}
              aria-label="Previous"
            >
              &#60;
            </button>
            <span className="news-slider-counter" aria-live="polite">
              {slideIndex + 1} / {CAROUSEL_SLIDES.length}
            </span>
            <button
              type="button"
              className="news-slider-btn"
              onClick={() => go(1)}
              aria-label="Next"
            >
              &#62;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BandOpeningSummary({ forecast, fmtHhMm, targetLabel }) {
  const now = new Date();
  const summary = useMemo(() => {
    const bands = ["20m", "15m", "10m", "40m"];
    const out = [];
    for (const band of bands) {
      const hours = (forecast.forecast || []).map((h, i) => ({ ...h, idx: i }));
      const openRanges = [];
      let inRange = false;
      let start = null;
      for (let i = 0; i < hours.length; i++) {
        const open = hours[i].bands?.[band];
        if (open && !inRange) {
          inRange = true;
          start = hours[i].utc;
        } else if (!open && inRange) {
          inRange = false;
          openRanges.push({ start, end: hours[i - 1]?.utc });
        }
      }
      if (inRange) openRanges.push({ start, end: hours[hours.length - 1]?.utc });
      const rangesStr = openRanges.length === 0
        ? null
        : openRanges.map((r) => `${fmtHhMm(r.start)}–${fmtHhMm(r.end)} UTC`).join(", ");
      const inOpening = openRanges.some(
        (r) => (now >= new Date(r.start)) && (now <= new Date(r.end))
      );
      const nextOpen = !inOpening ? openRanges.find((r) => new Date(r.start) > now) : null;
      out.push({ band, rangesStr, nextOpen });
    }
    return out;
  }, [forecast, fmtHhMm]);

  return (
    <div style={{ display: "grid", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
      <div style={{ color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>
        QTH → {targetLabel} ({forecast.distanceKm} km)
      </div>
      {summary.map(({ band, rangesStr, nextOpen }) => (
        <div key={band} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
          <strong style={{ minWidth: 28 }}>{band}</strong>
          {rangesStr ? (
            <>
              <span>possible {rangesStr}</span>
              {nextOpen && (
                <span style={{ color: "rgba(77,171,247,0.9)", fontSize: 11 }}>
                  · next at {fmtHhMm(nextOpen.start)} UTC
                </span>
              )}
            </>
          ) : (
            <span style={{ color: "rgba(255,255,255,0.45)" }}>closed in 24h</span>
          )}
        </div>
      ))}
    </div>
  );
}
