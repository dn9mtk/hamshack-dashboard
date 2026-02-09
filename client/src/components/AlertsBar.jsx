import { useEffect, useState } from "react";

export default function AlertsBar() {
  const [alerts, setAlerts] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/alerts")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((data) => {
        if (!cancelled) setAlerts(data.alerts || []);
      })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    const id = setInterval(() => {
      fetch("/api/alerts")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
        .then((data) => { if (!cancelled) setAlerts(data.alerts || []); })
        .catch(() => {});
    }, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (err && !alerts.length) {
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

  if (!alerts.length) return null;

  return (
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
  );
}
