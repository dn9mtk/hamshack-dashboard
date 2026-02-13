import { useEffect, useState } from "react";

export default function AlertsBar() {
  const [alerts, setAlerts] = useState([]);
  const [wantedDx, setWantedDx] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/alerts")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
        .then((data) => {
          if (!cancelled) {
            setAlerts(data.alerts || []);
            setWantedDx(data.wantedDx || []);
          }
        })
        .catch((e) => { if (!cancelled) setErr(String(e)); });
    }
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (err && !alerts.length && !wantedDx.length) {
    return (
      <div
        className="alerts-bar alerts-bar-error"
        role="alert"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px 16px",
          padding: "6px 12px",
          background: "rgba(240, 62, 62, 0.15)",
          borderBottom: "1px solid rgba(240, 62, 62, 0.3)",
          fontSize: 13,
          color: "rgba(255,255,255,0.9)"
        }}
      >
        <span style={{ fontWeight: 700, color: "#f03e3e" }}>⚠ Alerts</span>
        <span>Failed to load alerts. Retrying…</span>
      </div>
    );
  }

  const hasSpaceAlerts = alerts.length > 0;
  const hasWantedDx = wantedDx.length > 0;
  if (!hasSpaceAlerts && !hasWantedDx) return null;

  return (
    <>
      {hasSpaceAlerts && (
        <div
          className="alerts-bar"
          role="alert"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px 16px",
            padding: "6px 12px",
            background: "rgba(240, 62, 62, 0.2)",
            borderBottom: "1px solid rgba(240, 62, 62, 0.4)",
            fontSize: 13,
            color: "rgba(255,255,255,0.95)"
          }}
        >
          <span style={{ fontWeight: 700, color: "#f03e3e" }}>⚠ Alerts</span>
          {alerts.map((a, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {a.message}
            </span>
          ))}
        </div>
      )}
      {hasWantedDx && (
        <div
          className="alerts-bar alerts-bar-wanted"
          role="alert"
          aria-live="polite"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px 16px",
            padding: "6px 12px",
            background: "rgba(77,171,247,0.15)",
            borderBottom: "1px solid rgba(77,171,247,0.4)",
            fontSize: 13,
            color: "rgba(255,255,255,0.95)"
          }}
        >
          <span style={{ fontWeight: 700, color: "rgba(77,171,247,0.95)" }}>🎯 Wanted DX spotted</span>
          {wantedDx.slice(0, 6).map((s, i) => (
            <span key={i}>
              {s.dx} {s.freq} MHz {s.mode || ""}
              {s.entity ? ` (${s.entity})` : ""}
            </span>
          ))}
          {wantedDx.length > 6 && (
            <span style={{ color: "rgba(255,255,255,0.6)" }}>+{wantedDx.length - 6} more</span>
          )}
        </div>
      )}
    </>
  );
}
