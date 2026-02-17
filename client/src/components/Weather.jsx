import { useEffect, useState, useCallback } from "react";
import { formatDateTimeUtc } from "../lib/time.js";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";
import AmpelScale, { UV_SEGMENTS, AQI_SEGMENTS, getUvLevel } from "./AmpelScale.jsx";

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 13 }}>{value}</span>
    </div>
  );
}

function buildCarouselSlides(weatherData, outdoorData) {
  const slides = [{ type: "weather", data: weatherData }];
  if (outdoorData) {
    const uv = outdoorData.uv;
    const aq = outdoorData.airQuality;
    const todayUv = uv?.times?.length > 0 && uv?.uv_index_max?.[0] != null ? uv.uv_index_max[0] : null;
    if (uv && todayUv != null) slides.push({ type: "uv", uv, todayUv });
    if (aq && (aq.pm10 != null || aq.pm2_5 != null || aq.us_aqi != null)) slides.push({ type: "aq", aq });
  }
  return slides;
}

export default function Weather({ stationId }) {
  const [data, setData] = useState(null);
  const [outdoorData, setOutdoorData] = useState(null);
  const [err, setErr] = useState(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const station = (stationId || "IKELKH27").toUpperCase();

  async function load() {
    try {
      setErr(null);
      const r = await fetch(`/api/weather/current?station=${encodeURIComponent(station)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
    } catch (e) {
      setErr(String(e));
    }
  }

  async function loadOutdoor() {
    try {
      const r = await fetch("/api/outdoor");
      if (!r.ok) return;
      const j = await r.json();
      setOutdoorData(j);
    } catch {
      setOutdoorData(null);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [station]);

  useEffect(() => {
    loadOutdoor();
    const id = setInterval(loadOutdoor, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const slides = buildCarouselSlides(data, outdoorData);
  const idx = Math.min(carouselIndex, Math.max(0, slides.length - 1));
  const slide = slides[idx];
  const hasMultiple = slides.length > 1;

  const go = useCallback((delta) => {
    setCarouselIndex((i) => {
      const s = buildCarouselSlides(data, outdoorData);
      if (s.length <= 1) return i;
      return (i + delta + s.length) % s.length;
    });
  }, [outdoorData, data]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    },
    [go]
  );

  if (err) return <PanelError message={err} onRetry={load} label="Local Weather" />;
  if (!data) return <PanelLoading lines={5} />;

  const temp = data.temperature;
  const feels = data.feelsLike;
  const tempF = temp != null ? (temp * 9) / 5 + 32 : null;
  const feelsF = feels != null ? (feels * 9) / 5 + 32 : null;

  // Open-Meteo weather codes: 61-67 rain, 80-82 rain showers, 95-99 thunderstorm
  const code = data.weatherCode != null ? Number(data.weatherCode) : null;
  const isRain = code != null && ((code >= 61 && code <= 67) || (code >= 80 && code <= 82));
  const isThunderstorm = code != null && code >= 95 && code <= 99;
  const weatherWarning = isThunderstorm ? "Thunderstorm – avoid outdoor antenna work, unplug rig during storms." : isRain ? "Rain – VHF/UHF attenuation possible; condensation risk on antenna." : null;

  const slideLabels = { weather: "Weather", uv: "UV index", aq: "Air quality" };

  return (
    <div className="news-panel-content news-panel-slider">
      {weatherWarning && (
        <div
          className="panel-error"
          style={{
            padding: 8,
            borderRadius: 6,
            border: "1px solid rgba(239,68,68,0.5)",
            background: "rgba(239,68,68,0.15)",
            fontSize: 12,
            color: "rgba(254,202,202,0.95)"
          }}
          role="alert"
        >
          ⚠ {weatherWarning}
        </div>
      )}
      <div className="news-slider-card" style={{ padding: 12 }}>
        {slide.type === "weather" && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
              {slide.data.name || slide.data.stationId} · {slide.data.location || ""}
            </div>
            <Row
              label="Temperature"
              value={
                temp != null
                  ? `${temp.toFixed(1)} °C${tempF != null ? ` (${tempF.toFixed(1)} °F)` : ""}`
                  : "—"
              }
            />
            <Row
              label="Feels like"
              value={
                feels != null
                  ? `${feels.toFixed(1)} °C${feelsF != null ? ` (${feelsF.toFixed(1)} °F)` : ""}`
                  : "—"
              }
            />
            <Row label="Humidity" value={slide.data.humidity != null ? `${slide.data.humidity} %` : "—"} />
            <Row label="Pressure" value={slide.data.pressure != null ? `${slide.data.pressure} hPa` : "—"} />
            <Row
              label="Wind"
              value={
                slide.data.windSpeed != null
                  ? `${slide.data.windSpeed} km/h${slide.data.windDirection != null ? ` · ${slide.data.windDirection}°` : ""}`
                  : "—"
              }
            />
            <Row label="Precip" value={slide.data.precipitation != null ? `${slide.data.precipitation} mm` : "—"} />
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
              Updated: {formatDateTimeUtc(slide.data.updated)}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              Source: {slide.data.source || "—"}.{" "}
              {slide.data.dashboardUrl && (
                <a href={slide.data.dashboardUrl} target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,0.75)" }}>
                  WU dashboard
                </a>
              )}
            </div>
          </div>
        )}
        {slide.type === "uv" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>UV index</div>
            <AmpelScale segments={UV_SEGMENTS} value={slide.todayUv} valueLabel="UV index" />
            {slide.uv?.times?.length > 1 && (
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
                {slide.uv.times.slice(1, 5).map((d, i) => {
                  const val = slide.uv?.uv_index_max?.[i + 1];
                  if (val == null) return null;
                  const lev = getUvLevel(val);
                  return (
                    <span key={d} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: lev.color, fontWeight: 600 }}>{Number(val).toFixed(1)}</span>
                      <span>{d.slice(5)}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
        {slide.type === "aq" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Air quality</div>
            <AmpelScale segments={AQI_SEGMENTS} value={slide.aq.us_aqi ?? slide.aq.european_aqi} valueLabel="Air quality" valueMax />
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 12, marginTop: 10, color: "var(--muted)" }}>
              {slide.aq.pm10 != null && (
                <>
                  <span>PM10</span>
                  <span><strong style={{ color: "var(--text)" }}>{Number(slide.aq.pm10).toFixed(1)}</strong> μg/m³</span>
                </>
              )}
              {slide.aq.pm2_5 != null && (
                <>
                  <span>PM2.5</span>
                  <span><strong style={{ color: "var(--text)" }}>{Number(slide.aq.pm2_5).toFixed(1)}</strong> μg/m³</span>
                </>
              )}
            </div>
          </>
        )}
      </div>
      {hasMultiple && (
        <div
          className="news-slider-nav"
          role="group"
          aria-label="Navigate weather, UV, air quality"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <div className="news-slider-nav-row">
            <button type="button" className="news-slider-btn" onClick={() => go(-1)} aria-label="Previous">&#60;</button>
            <span className="news-slider-counter" aria-live="polite">
              {idx + 1} / {slides.length} · {slideLabels[slide.type] || slide.type}
            </span>
            <button type="button" className="news-slider-btn" onClick={() => go(1)} aria-label="Next">&#62;</button>
          </div>
        </div>
      )}
    </div>
  );
}
