import { useEffect, useState } from "react";

function fmtLocal(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtUtc(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function fmtUtcHhMm(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export default function Clock({ sunData }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const today = sunData?.today;

  return (
    <div style={{ justifySelf: "end", textAlign: "right" }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>UTC {fmtUtc(now)}</div>
      <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 13 }}>Local {fmtLocal(now)}</div>
      {today && (
        <div
          style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}
          title="Sunrise/sunset UTC. The grayline (dawn/dusk band) often gives excellent long-path DX."
        >
          Sun ↑ {fmtUtcHhMm(today.sunriseUtc)}  ↓ {fmtUtcHhMm(today.sunsetUtc)} UTC
        </div>
      )}
    </div>
  );
}
