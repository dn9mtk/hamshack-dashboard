import { useEffect, useState } from "react";
import { formatDateTimeUtc } from "../lib/time.js";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 13 }}>{value}</span>
    </div>
  );
}

export default function Weather({ stationId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
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

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [station]);

  if (err) return <PanelError message={err} onRetry={load} label="Local Weather" />;
  if (!data) return <PanelLoading lines={5} />;

  const temp = data.temperature;
  const feels = data.feelsLike;
  const tempF = temp != null ? (temp * 9) / 5 + 32 : null;
  const feelsF = feels != null ? (feels * 9) / 5 + 32 : null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
        {data.name || data.stationId} · {data.location || ""}
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
      <Row label="Humidity" value={data.humidity != null ? `${data.humidity} %` : "—"} />
      <Row label="Pressure" value={data.pressure != null ? `${data.pressure} hPa` : "—"} />
      <Row
        label="Wind"
        value={
          data.windSpeed != null
            ? `${data.windSpeed} km/h${data.windDirection != null ? ` · ${data.windDirection}°` : ""}`
            : "—"
        }
      />
      <Row label="Precip" value={data.precipitation != null ? `${data.precipitation} mm` : "—"} />
      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
        Updated: {formatDateTimeUtc(data.updated)}
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
        Source: {data.source || "—"} (for station location).{" "}
        <a
          href={data.dashboardUrl}
          target="_blank"
          rel="noreferrer"
          style={{ color: "rgba(255,255,255,0.75)" }}
        >
          WU dashboard
        </a>
      </div>
    </div>
  );
}
