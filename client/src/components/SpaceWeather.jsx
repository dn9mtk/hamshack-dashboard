import { useEffect, useState } from "react";
import { formatDateTimeUtc } from "../lib/time.js";
import PanelLoading from "./PanelLoading.jsx";
import PanelError from "./PanelError.jsx";

export default function SpaceWeather() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  async function load() {
    try {
      setErr(null);
      const r = await fetch("/api/space/summary");
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
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

  if (err) return <PanelError message={err} onRetry={load} label="Space weather" />;
  if (!data) return <PanelLoading lines={6} />;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Row label="Kp" value={data.kp ? `${data.kp.kp} (at ${formatDateTimeUtc(data.kp.time)})` : "—"} />
      <Row label="A" value={data.aIndex ? `${data.aIndex.a} (at ${formatDateTimeUtc(data.aIndex.time)})` : "—"} />
      <Row label="SFI" value={data.solarFlux ? `${data.solarFlux.sfi} (at ${formatDateTimeUtc(data.solarFlux.time)})` : "—"} />
      <Row label="X-ray" value={data.xray ? `short ${data.xray.short} (at ${formatDateTimeUtc(data.xray.time)})` : "—"} />
      <Row
        label="Solar wind"
        value={
          data.solarWind
            ? `${data.solarWind.speed} km/s · ${data.solarWind.density} p/cc · Bz ${data.solarWind.bz} nT (at ${formatDateTimeUtc(data.solarWind.time)})`
            : "—"
        }
      />

      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
        Updated: {formatDateTimeUtc(data.updated)}
      </div>
      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
        Source:{" "}
        <a
          href="https://services.swpc.noaa.gov/"
          target="_blank"
          rel="noreferrer"
          style={{ color: "rgba(255,255,255,0.78)" }}
        >
          NOAA SWPC
        </a>
        {" · "}
        <a
          href="https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"
          target="_blank"
          rel="noreferrer"
          style={{ color: "rgba(255,255,255,0.78)" }}
        >
          Kp
        </a>
        {" · "}
        <a
          href="https://services.swpc.noaa.gov/products/planetary-a-index.json"
          target="_blank"
          rel="noreferrer"
          style={{ color: "rgba(255,255,255,0.78)" }}
        >
          A
        </a>
        {" · "}
        <a
          href="https://services.swpc.noaa.gov/json/f107_cm_flux.json"
          target="_blank"
          rel="noreferrer"
          style={{ color: "rgba(255,255,255,0.78)" }}
        >
          SFI
        </a>
        {" · "}
        <a
          href="https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json"
          target="_blank"
          rel="noreferrer"
          style={{ color: "rgba(255,255,255,0.78)" }}
        >
          X-ray
        </a>
        {" · "}
        <a
          href="https://services.swpc.noaa.gov/products/solar-wind/plasma-1-hour.json"
          target="_blank"
          rel="noreferrer"
          style={{ color: "rgba(255,255,255,0.78)" }}
        >
          Solar wind
        </a>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "min-content 1fr",
        gap: 12,
        alignItems: "baseline"
      }}
    >
      <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ fontWeight: 700, fontSize: 13, textAlign: "right", wordBreak: "break-word", minWidth: 0 }}>
        {value}
      </span>
    </div>
  );
}
